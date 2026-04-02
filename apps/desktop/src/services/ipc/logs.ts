export type JobLogDto = {
  id: number;
  status: string;
  templateName: string;
};

export async function fetchJobLogs(): Promise<JobLogDto[]> {
  return [];
}