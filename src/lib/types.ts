export type ToolCallEvent = {
  id: string;
  name: string;
  status: string;
  detail: string;
  timestamp: string;
};

export type Summary = {
  session_id: string;
  contact_number?: string | null;
  summary: string;
  booked_appointments: Array<{
    id: string;
    contact_number: string;
    name: string;
    date: string;
    time: string;
    status: string;
  }>;
  preferences: string[];
  created_at: string;
};

export type SessionStartResponse = {
  session_id: string;
  ws_url: string;
};
