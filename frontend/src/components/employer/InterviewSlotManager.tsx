import { EmployerInterviewSlotManagerDialog } from '@/components/employer/EmployerInterviewSlotPanel';

export interface InterviewSlotManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Accessible employer-facing dialog backed by the native interview slot API. */
export function InterviewSlotManager(props: InterviewSlotManagerProps) {
  return <EmployerInterviewSlotManagerDialog {...props} />;
}
