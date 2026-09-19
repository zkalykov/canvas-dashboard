'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import canvasApi, { CanvasApiError } from '@/lib/canvas-api';
import { usePlannerNotes, usePlannerOverrides, type LoadOptions } from '@/hooks/use-canvas';
import type { PersonalTask, PlannerNote, PlannerOverride } from '@/lib/types';

/**
 * Personal tasks are Canvas Planner Notes, so they belong to the signed-in
 * student and sync with the Canvas planner / To-Do list on every device.
 * Completion lives in Canvas planner overrides (plannable_type planner_note).
 */

/** Canvas returns 'PlannerNote' in some places and 'planner_note' in others. */
function isPlannerNoteType(type: string | null | undefined): boolean {
  return (type ?? '').toLowerCase().replace(/_/g, '') === 'plannernote';
}

function isActiveOverride(override: PlannerOverride): boolean {
  return override.workflow_state !== 'deleted' && !override.deleted_at;
}

function findNoteOverride(overrides: PlannerOverride[] | undefined, noteId: number): PlannerOverride | undefined {
  return overrides?.find(o => o.plannable_id === noteId && isPlannerNoteType(o.plannable_type) && isActiveOverride(o));
}

/** yyyy-mm-dd (from <input type="date">) -> local noon ISO, so the day survives small time-zone differences. */
function toTodoDate(dueDate?: string): string {
  if (!dueDate) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today.toISOString();
  }
  const dateOnly = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12).toISOString();
  }
  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? toTodoDate() : parsed.toISOString();
}

function toError(err: unknown, fallback: string): Error {
  if (err instanceof CanvasApiError) return new Error(err.message || fallback);
  return err instanceof Error ? err : new Error(fallback);
}

const TEMP_ID_PREFIX = 'temp-';

export function useTasks(options?: LoadOptions) {
  const { mutate: globalMutate } = useSWRConfig();
  const notes = usePlannerNotes(options);
  const overrides = usePlannerOverrides(options);
  const mutateNotes = notes.refetch;
  const mutateOverrides = overrides.refetch;
  const [actionError, setActionError] = useState<Error | null>(null);
  const pendingRef = useRef(new Set<string>());

  const tasks = useMemo<PersonalTask[]>(() => {
    const list = (notes.data ?? [])
      .filter(note => note.workflow_state !== 'deleted')
      .map(note => ({
        id: note.id < 0 ? `${TEMP_ID_PREFIX}${-note.id}` : String(note.id),
        title: note.title,
        completed: Boolean(findNoteOverride(overrides.data, note.id)?.marked_complete),
        dueDate: note.todo_date ?? undefined,
        courseId: note.course_id ?? undefined,
        createdAt: note.todo_date,
      }));
    return list.sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [notes.data, overrides.data]);

  /** Planner item lists (/todo, dashboard, calendar) include notes too, so refresh them as well. */
  const revalidatePlannerItems = useCallback(() => {
    void globalMutate(
      key =>
        typeof key === 'string' &&
        key.startsWith('canvas_planner_') &&
        key !== 'canvas_planner_notes' &&
        key !== 'canvas_planner_overrides'
    );
  }, [globalMutate]);

  const addTask = useCallback(
    async (title: string, dueDate?: string, courseId?: number): Promise<PersonalTask> => {
      const todoDate = toTodoDate(dueDate);
      const tempId = -Date.now();
      const optimistic: PlannerNote = {
        id: tempId,
        title,
        user_id: 0,
        workflow_state: 'active',
        course_id: courseId ?? null,
        todo_date: todoDate,
      };
      setActionError(null);
      try {
        let created: PlannerNote | undefined;
        await mutateNotes(
          async current => {
            created = await canvasApi.createPlannerNote({
              title,
              todo_date: todoDate,
              ...(courseId ? { course_id: courseId } : {}),
            });
            return [...(current ?? []).filter(n => n.id !== tempId), created];
          },
          {
            optimisticData: current => [...(current ?? []), optimistic],
            rollbackOnError: true,
            populateCache: true,
            revalidate: true,
          }
        );
        revalidatePlannerItems();
        const note = created ?? optimistic;
        return {
          id: String(note.id),
          title: note.title,
          completed: false,
          dueDate: note.todo_date,
          courseId: note.course_id ?? undefined,
          createdAt: note.todo_date,
        };
      } catch (err) {
        const error = toError(err, 'Could not create the task in Canvas');
        setActionError(error);
        throw error;
      }
    },
    [mutateNotes, revalidatePlannerItems]
  );

  const toggleTask = useCallback(
    async (id: string) => {
      const noteId = Number(id);
      if (!Number.isFinite(noteId) || noteId <= 0 || pendingRef.current.has(id)) return;
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      const complete = !task.completed;
      const existing = findNoteOverride(overrides.data, noteId);

      const upsert = (current: PlannerOverride[] | undefined, next: PlannerOverride) => {
        const list = current ?? [];
        const index = list.findIndex(o => o.plannable_id === noteId && isPlannerNoteType(o.plannable_type));
        if (index === -1) return [...list, next];
        return list.map((o, i) => (i === index ? next : o));
      };
      const now = new Date().toISOString();
      const optimistic: PlannerOverride = existing
        ? { ...existing, marked_complete: complete }
        : {
            id: 0,
            plannable_type: 'planner_note',
            plannable_id: noteId,
            user_id: 0,
            workflow_state: 'active',
            marked_complete: complete,
            dismissed: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          };

      pendingRef.current.add(id);
      setActionError(null);
      try {
        await mutateOverrides(
          async current => {
            const saved = await canvasApi.setPlannerItemComplete(
              { plannable_type: 'planner_note', plannable_id: noteId, planner_override: existing ?? null },
              complete
            );
            return upsert(current, saved);
          },
          {
            optimisticData: current => upsert(current, optimistic),
            rollbackOnError: true,
            populateCache: true,
            revalidate: true,
          }
        );
        revalidatePlannerItems();
      } catch (err) {
        setActionError(toError(err, 'Could not update the task in Canvas'));
      } finally {
        pendingRef.current.delete(id);
      }
    },
    [tasks, overrides.data, mutateOverrides, revalidatePlannerItems]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const noteId = Number(id);
      if (!Number.isFinite(noteId) || noteId <= 0 || pendingRef.current.has(id)) return;
      pendingRef.current.add(id);
      setActionError(null);
      try {
        await mutateNotes(
          async current => {
            await canvasApi.deletePlannerNote(noteId);
            return (current ?? []).filter(n => n.id !== noteId);
          },
          {
            optimisticData: current => (current ?? []).filter(n => n.id !== noteId),
            rollbackOnError: true,
            populateCache: true,
            revalidate: true,
          }
        );
        revalidatePlannerItems();
      } catch (err) {
        setActionError(toError(err, 'Could not delete the task in Canvas'));
      } finally {
        pendingRef.current.delete(id);
      }
    },
    [mutateNotes, revalidatePlannerItems]
  );

  const refetch = useCallback(async () => {
    setActionError(null);
    await Promise.all([mutateNotes(), mutateOverrides()]);
  }, [mutateNotes, mutateOverrides]);

  return {
    tasks,
    loading: notes.loading || overrides.loading,
    error: (notes.error ?? actionError ?? overrides.error ?? null) as Error | null,
    addTask,
    toggleTask,
    deleteTask,
    refetch,
  };
}
