"use client";

import { useState } from "react";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_enrolled: boolean;
  is_active: boolean;
  created_at: string;
}

interface EmployeeTableProps {
  employees: Employee[];
}

/**
 * Searchable, paginated employee table.
 */
export default function EmployeeTable({ employees }: EmployeeTableProps) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter employees by search
  const filtered = employees.filter(
    (e) =>
      e.first_name.toLowerCase().includes(search.toLowerCase()) ||
      e.last_name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase())
  );

  // Paginate
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div id="employees" className="panel">
      <div className="toolbar">
        <div className="panel-title">
          <div>
            <h2>Employees</h2>
          </div>
        </div>
        <div className="search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search employees…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Enrolled</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-faint)" }}>
                  {search ? "No employees match your search" : "No employees found"}
                </td>
              </tr>
            ) : (
              paginated.map((employee) => (
                <tr key={employee.id}>
                  <td className="cell-name">
                    {employee.first_name} {employee.last_name}
                  </td>
                  <td className="cell-sub">{employee.email}</td>
                  <td>
                    <span className={`pill ${employee.is_enrolled ? "pill-verified" : "pill-moderate"}`}>
                      {employee.is_enrolled ? "Enrolled" : "Pending"}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${employee.is_active ? "pill-verified" : "pill-flagged"}`}>
                      {employee.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="mono" style={{ color: "var(--text-mute)" }}>
                    {new Date(employee.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-[var(--line)] flex items-center justify-between text-xs text-[var(--text-mute)]">
          <p>
            Showing {(currentPage - 1) * itemsPerPage + 1}–
            {Math.min(currentPage * itemsPerPage, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn btn-outline btn-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn btn-outline btn-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
