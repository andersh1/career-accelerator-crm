import KanbanBoard from "@/components/crm/KanbanBoard";
import RevenueSummary from "@/components/crm/RevenueSummary";

export const metadata = { title: "Pipeline — 10x Career Accelerator CRM" };

export default function PipelinePage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-0">
        <h1 className="text-xl font-bold text-slate-900">Pipeline</h1>
        <p className="text-sm text-slate-500 mt-0.5">Kanban view of your lead pipeline.</p>
        <RevenueSummary />
      </div>
      <div className="flex-1 min-h-0 mt-4">
        <KanbanBoard />
      </div>
    </div>
  );
}
