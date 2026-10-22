export type Workspace = {
  id: string
  name: string
  invite_code: string
  event_date: string | null
  owner_id: string
}

export type Task = {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  notes: string | null
  category: string
  due_date: string | null
  estimated_cost: number | null
  is_paid: boolean
  completed: boolean
  created_at: string
  created_by: string | null
}

export const CATEGORIES = [
  'Allgemein',
  'Henna-Abend',
  'Standesamt',
  'Hochzeitsfeier',
  'Dienstleister',
  'Kleidung',
  'Gäste',
] as const

export type Category = (typeof CATEGORIES)[number]

export type TaskInput = Omit<
  Task,
  'id' | 'created_at' | 'created_by' | 'workspace_id' | 'completed'
>
