import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function DepartmentsPage() {
  const departments = await prisma.department.findMany({
    include: { printers: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Departamentos</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept) => (
          <Link
            key={dept.id}
            href={`/departamentos/${dept.id}`}
            className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4 hover:border-slate-300 hover:shadow-sm"
          >
            <p className="font-medium text-slate-900">{dept.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {dept.printers.length} impresora{dept.printers.length === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
