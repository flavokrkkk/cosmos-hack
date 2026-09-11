import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Склейка классов Tailwind: условные классы через clsx, конфликты снимает twMerge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
