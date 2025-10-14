// frontend/src/types.ts
export type StatsData = {
  userId: string
  coin_balance: number
  logins: { total_login_days: number }
}

export type Notice = {
  id: number
  title: string
  content_html: string
  image_url?: string
  link_url?: string
  kind?: string
  priority: number
  created_at: string
}
