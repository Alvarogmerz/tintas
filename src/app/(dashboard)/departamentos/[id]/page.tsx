import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const department = await prisma.department.findUnique({
    where: { id: Number(id) },
    include: { printers: { include: { readings: { orderBy: { readAt: "desc" }, take: 5 } } } },
  });
  if (!department) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">{department.name}</h1>

      <div className="space-y-3">
        {department.printers.map((printer) => (
          <Link
            key={printer.id}
            href={`/impresoras/${printer.id}`}
            className="block rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4 hover:border-slate-300 hover:shadow-sm"
          >
            <p className="font-medium text-slate-900">
              {printer.brand} {printer.model}
            </p>
            <p className="text-sm text-slate-500">{printer.ip ?? "sin IP"}</p>
          </Link>
        ))}
        {department.printers.length === 0 && (
          <p className="text-sm text-slate-500">Este departamento no tiene impresoras registradas.</p>
        )}
      </div>
    </div>
  );
}
