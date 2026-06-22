import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export default async function ProposalPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") redirect("/login");

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      company: true, jobTitle: true, linkedinUrl: true,
      dealValue: true, paymentStatus: true, notes: true,
    },
  });
  if (!lead) notFound();

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["proposal_program_name", "proposal_tagline", "proposal_footer"] } },
  });
  const s = Object.fromEntries(settings.map(x => [x.key, x.value]));
  const programName = s.proposal_program_name ?? "10x Career Accelerator Program";
  const tagline     = s.proposal_tagline ?? "Land your next role. Faster.";
  const footer      = s.proposal_footer  ?? "Questions? Reply to this proposal or book a call.";

  const today  = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const expiry = new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function fmtPayment(status: string | null) {
    const map: Record<string, string> = {
      PAID_FULL: "Paid in Full", PAYMENT_PLAN: "Payment Plan Available",
      SCHOLARSHIP: "Scholarship Applied", UNPAID: "Invoice on Enrollment",
    };
    return status ? (map[status] ?? status) : "Invoice on Enrollment";
  }

  return (
    <>
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <Link href={`/leads/${params.id}`}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition">
          <ArrowLeft size={14} /> Back to lead
        </Link>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
          <Printer size={14} /> Save as PDF
        </button>
      </div>

      {/* Proposal document */}
      <div className="print:m-0 pt-16 print:pt-0 bg-slate-100 print:bg-white min-h-screen">
        <div className="max-w-[760px] mx-auto bg-white print:shadow-none shadow-2xl print:rounded-none rounded-2xl overflow-hidden my-8 print:my-0">

          {/* Header */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 px-12 py-10 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-blue-300 text-xs font-bold tracking-widest uppercase mb-2">10x Career Accelerator</p>
                <h1 className="text-3xl font-extrabold leading-tight">{programName}</h1>
                <p className="text-blue-200 mt-2 text-base">{tagline}</p>
              </div>
              <div className="text-right text-xs text-blue-300 space-y-1 shrink-0 ml-8">
                <p>Prepared for</p>
                <p className="text-white font-bold text-base">{lead.firstName} {lead.lastName}</p>
                <p className="mt-2">{today}</p>
              </div>
            </div>
          </div>

          <div className="px-12 py-10 space-y-10">

            {/* Recipient info */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Prepared For</p>
                <p className="text-lg font-bold text-slate-900">{lead.firstName} {lead.lastName}</p>
                {lead.jobTitle && <p className="text-sm text-slate-600">{lead.jobTitle}</p>}
                {lead.company  && <p className="text-sm text-slate-500">{lead.company}</p>}
                <p className="text-sm text-blue-600 mt-1">{lead.email}</p>
                {lead.phone && <p className="text-sm text-slate-500">{lead.phone}</p>}
              </div>
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Investment</p>
                {lead.dealValue ? (
                  <>
                    <p className="text-3xl font-extrabold text-slate-900">${lead.dealValue.toLocaleString()}</p>
                    <p className="text-sm text-slate-500 mt-1">{fmtPayment(lead.paymentStatus)}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Contact us for pricing</p>
                )}
                <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-400">
                  <p>Offer valid until {expiry}</p>
                </div>
              </div>
            </div>

            {/* What's included */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">What&apos;s Included</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: "🎯", title: "8-Module Curriculum",    desc: "Structured coaching across positioning, networking, interviewing, and offers" },
                  { icon: "👤", title: "1:1 Coaching Sessions",  desc: "Direct access to your coach throughout the program" },
                  { icon: "👥", title: "Cohort Community",       desc: "Learn alongside peers making similar career moves" },
                  { icon: "📋", title: "Live Sessions",          desc: "Interactive workshops with real-time feedback and Q&A" },
                  { icon: "📚", title: "Pre-Work Materials",     desc: "Assignments and frameworks to build momentum before each session" },
                  { icon: "🏆", title: "Completion Certificate", desc: "Recognized credential upon successfully finishing the program" },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">How It Works</p>
              <div className="space-y-3">
                {[
                  { step: "01", title: "Enroll & Onboard",    desc: "Complete your intake, access the student portal, and meet your coach." },
                  { step: "02", title: "Complete Pre-Work",    desc: "Each module has pre-work due before your live session — this is where the real work happens." },
                  { step: "03", title: "Attend Live Sessions", desc: "Bi-weekly sessions where you review your work, get feedback, and refine your strategy." },
                  { step: "04", title: "Execute & Land",       desc: "Apply what you learn in real-time — networking outreach, applications, interviews, and offers." },
                ].map(item => (
                  <div key={item.step} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                      {item.step}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Outcomes */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-4">Typical Outcomes</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { stat: "85%",    label: "land a new role within 6 months" },
                  { stat: "2–3×",   label: "faster job search vs. going solo" },
                  { stat: "94%",    label: "report greater career clarity" },
                ].map(item => (
                  <div key={item.stat}>
                    <p className="text-2xl font-extrabold text-blue-700">{item.stat}</p>
                    <p className="text-xs text-slate-600 mt-1">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Personal notes */}
            {lead.notes && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notes for {lead.firstName}</p>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-xl p-4">
                  {lead.notes}
                </p>
              </div>
            )}

            {/* Next steps */}
            <div className="border-t border-slate-100 pt-8">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Next Steps</p>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">✓</div>
                <p className="text-sm text-slate-700">Reply to this proposal with any questions or to confirm your spot</p>
              </div>
              <div className="flex items-start gap-3 mt-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">→</div>
                <p className="text-sm text-slate-700">We&apos;ll send enrollment details and portal access within 24 hours of confirmation</p>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-12 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">{footer}</p>
            <p className="text-xs text-slate-300">10x Career Accelerator · {today}</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 0; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
