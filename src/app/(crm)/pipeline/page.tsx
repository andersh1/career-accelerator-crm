import KanbanBoard from "@/components/crm/KanbanBoard";
import RevenueSummary from "@/components/crm/RevenueSummary";

export const metadata = { title: "Pipeline — Vantage Career Accelerator CRM" };

export default function PipelinePage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-0 animate-fade-up">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1 font-display" style={{ color: "#8a938f" }}>Vantage Career Accelerator</p>
        <h1 className="text-xl font-display font-semibold" style={{ color: "#14211f" }}>Pipeline</h1>
        <p className="text-sm mt-0.5" style={{ color: "#8a938f" }}>Kanban view of your lead pipeline.</p>
        <RevenueSummary />
      </div>
      <div className="flex-1 min-h-0 mt-4">
        <KanbanBoard />
      </div>
    </div>
  );
}
