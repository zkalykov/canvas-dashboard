/**
 * Sample data for the interactive demo on the landing page. Everything is made up
 * and dates are relative to when the page loads. Nothing here talks to Canvas.
 */

export interface DemoCourse {
  id: number;
  name: string;
  code: string;
  color: string;
  grade: number;
  letter: string;
  teacher: string;
}

export type DemoState = 'open' | 'missing' | 'submitted' | 'graded';

export interface DemoAssignment {
  id: number;
  courseId: number;
  name: string;
  due: Date;
  state: DemoState;
  points: number;
  score?: number;
  description: string;
}

export interface DemoFile {
  id: number;
  courseId: number;
  name: string;
  size: string;
  kind: 'pdf' | 'doc' | 'slides';
  pages: string[];
}

export interface DemoMessage {
  from: string;
  at: Date;
  body: string;
}

export interface DemoConversation {
  id: number;
  subject: string;
  courseId: number;
  unread: boolean;
  messages: DemoMessage[];
}

export interface DemoGroup {
  name: string;
  weight: number;
  items: { name: string; score: number | null; points: number }[];
}

const HOUR = 36e5;
const DAY = 24 * HOUR;
const now = Date.now();
const at = (offset: number) => new Date(now + offset);

export const COURSES: DemoCourse[] = [
  { id: 1, name: 'Biology 101', code: 'BIO101', color: '#22a06b', grade: 94.2, letter: 'A', teacher: 'Dr. Patel' },
  { id: 2, name: 'Calculus I', code: 'MATH151', color: '#3b82f6', grade: 88.5, letter: 'B+', teacher: 'Prof. Rivera' },
  { id: 3, name: 'World History', code: 'HIST110', color: '#e5484d', grade: 91.0, letter: 'A-', teacher: 'Ms. Okafor' },
  { id: 4, name: 'Chemistry', code: 'CHEM120', color: '#a855f7', grade: 85.3, letter: 'B', teacher: 'Dr. Chen' },
];

export const ASSIGNMENTS: DemoAssignment[] = [
  { id: 1, courseId: 1, name: 'Reading quiz: Chapter 6', due: at(3 * HOUR), state: 'open', points: 10, description: 'A short quiz on cell respiration. You have one attempt and 20 minutes.' },
  { id: 2, courseId: 4, name: 'Lab report: Reaction rates', due: at(22 * HOUR), state: 'open', points: 50, description: 'Write up your results from Tuesday’s lab. Include your data table, graph and a one-page discussion.' },
  { id: 3, courseId: 3, name: 'Essay outline', due: at(3 * DAY), state: 'open', points: 20, description: 'Outline your final essay: thesis, three supporting arguments and at least four sources.' },
  { id: 4, courseId: 2, name: 'Problem set 4', due: at(5 * DAY), state: 'open', points: 30, description: 'Problems 4.1 to 4.18, odd numbers only. Show your work.' },
  { id: 5, courseId: 4, name: 'Titration pre-lab', due: at(9 * DAY), state: 'open', points: 10, description: 'Answer the pre-lab questions before coming to lab.' },
  { id: 6, courseId: 1, name: 'Cell structure worksheet', due: at(-2 * DAY), state: 'missing', points: 15, description: 'Label the diagrams and answer questions 1 to 12.' },
  { id: 7, courseId: 2, name: 'Problem set 3', due: at(-1 * DAY), state: 'submitted', points: 30, description: 'Problems 3.1 to 3.20.' },
  { id: 8, courseId: 1, name: 'Quiz 3', due: at(-3 * DAY), state: 'graded', points: 10, score: 9, description: 'Quiz on membranes and transport.' },
  { id: 9, courseId: 2, name: 'Midterm exam', due: at(-6 * DAY), state: 'graded', points: 100, score: 88, description: 'Chapters 1 to 3.' },
  { id: 10, courseId: 3, name: 'Reading response', due: at(-4 * DAY), state: 'graded', points: 10, score: 10, description: 'One page on the primary source from week 4.' },
];

const lorem = [
  'This document is part of the demo. In your real dashboard, files from your courses open right here, without leaving the page.',
  'PDFs, images, videos and text files preview inline. Anything else can be downloaded with one click.',
  'Folders from Canvas are kept as they are, and you can search all files in a course by name.',
];

export const FILES: DemoFile[] = [
  { id: 1, courseId: 1, name: 'Syllabus.pdf', size: '184 KB', kind: 'pdf', pages: ['Biology 101 · Syllabus', ...lorem] },
  { id: 2, courseId: 1, name: 'Lecture 6 · Cell respiration.pdf', size: '2.4 MB', kind: 'slides', pages: ['Cell respiration', ...lorem] },
  { id: 3, courseId: 2, name: 'Formula sheet.pdf', size: '96 KB', kind: 'pdf', pages: ['Calculus I · Formula sheet', ...lorem] },
  { id: 4, courseId: 3, name: 'Essay guidelines.docx', size: '38 KB', kind: 'doc', pages: ['Final essay guidelines', ...lorem] },
  { id: 5, courseId: 4, name: 'Lab safety rules.pdf', size: '410 KB', kind: 'pdf', pages: ['Lab safety rules', ...lorem] },
  { id: 6, courseId: 4, name: 'Week 3 notes.docx', size: '52 KB', kind: 'doc', pages: ['Week 3 notes', ...lorem] },
];

export const CONVERSATIONS: DemoConversation[] = [
  {
    id: 1,
    subject: 'Office hours moved to Thursday',
    courseId: 2,
    unread: true,
    messages: [{ from: 'Prof. Rivera', at: at(-5 * HOUR), body: 'Hi everyone, this week’s office hours are moving to Thursday 2–4 PM in room 214. Bring your questions on problem set 4!' }],
  },
  {
    id: 2,
    subject: 'Lab groups for next week',
    courseId: 4,
    unread: true,
    messages: [
      { from: 'Dr. Chen', at: at(-1 * DAY), body: 'Lab groups are posted. You are in group C with Sam and Priya.' },
      { from: 'You', at: at(-20 * HOUR), body: 'Thanks! Do we need to bring our own goggles?' },
      { from: 'Dr. Chen', at: at(-18 * HOUR), body: 'Goggles are provided, just wear closed-toe shoes.' },
    ],
  },
  {
    id: 3,
    subject: 'Midterm review session',
    courseId: 1,
    unread: false,
    messages: [{ from: 'Dr. Patel', at: at(-3 * DAY), body: 'Review session on Monday at 6 PM. Slides will be in Files afterwards.' }],
  },
];

export const GRADE_GROUPS: Record<number, DemoGroup[]> = {
  1: [
    { name: 'Quizzes', weight: 30, items: [{ name: 'Quiz 1', score: 10, points: 10 }, { name: 'Quiz 2', score: 9, points: 10 }, { name: 'Quiz 3', score: 9, points: 10 }] },
    { name: 'Worksheets', weight: 20, items: [{ name: 'Cell structure worksheet', score: null, points: 15 }, { name: 'Microscopy worksheet', score: 14, points: 15 }] },
    { name: 'Exams', weight: 50, items: [{ name: 'Midterm', score: 95, points: 100 }] },
  ],
  2: [
    { name: 'Problem sets', weight: 40, items: [{ name: 'Problem set 1', score: 27, points: 30 }, { name: 'Problem set 2', score: 26, points: 30 }, { name: 'Problem set 3', score: null, points: 30 }] },
    { name: 'Exams', weight: 60, items: [{ name: 'Midterm exam', score: 88, points: 100 }] },
  ],
  3: [
    { name: 'Responses', weight: 40, items: [{ name: 'Reading response 1', score: 9, points: 10 }, { name: 'Reading response 2', score: 10, points: 10 }] },
    { name: 'Essays', weight: 60, items: [{ name: 'Short essay', score: 45, points: 50 }] },
  ],
  4: [
    { name: 'Labs', weight: 50, items: [{ name: 'Lab 1: Density', score: 42, points: 50 }, { name: 'Lab 2: Solutions', score: 44, points: 50 }] },
    { name: 'Quizzes', weight: 50, items: [{ name: 'Quiz 1', score: 8, points: 10 }, { name: 'Quiz 2', score: 8.5, points: 10 }] },
  ],
};

export const courseById = (id: number) => COURSES.find(c => c.id === id)!;
