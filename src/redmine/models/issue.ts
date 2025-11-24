import { NamedEntity } from "./named-entity";

export interface Issue {
  id: number;
  project: NamedEntity;
  tracker: NamedEntity;
  status: NamedEntity;
  priority: NamedEntity;
  author: NamedEntity;
  assigned_to: NamedEntity;
  subject: string;
  description: string;
  start_date: string;
  due_date: string | null;
  done_ratio: number;
  is_private: boolean;
  estimated_hours: number | null;
  /** Hours spent on this issue directly (Redmine API returns this) */
  spent_hours?: number;
  /** Total hours including subtasks (Redmine API returns this) */
  total_spent_hours?: number;
  created_on: string;
  updated_on: string;
  closed_on: string | null;
}
