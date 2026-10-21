type Assignment = {
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  co_assignees?: unknown;
};

export type Assignee = { id: string; name: string };
export type AssignmentMode = "claim" | "join" | "release" | "share";

export function leadAssignees(lead: Assignment): Assignee[] {
  const people = new Map<string, Assignee>();
  if (lead.assigned_to) {
    people.set(lead.assigned_to, { id: lead.assigned_to, name: lead.assigned_to_name || "Responsável" });
  }
  if (Array.isArray(lead.co_assignees)) {
    for (const person of lead.co_assignees) {
      if (person && typeof person.id === "string" && person.id && !people.has(person.id)) {
        people.set(person.id, { id: person.id, name: typeof person.name === "string" && person.name ? person.name : "Responsável" });
      }
    }
  }
  return [...people.values()];
}

export function isLeadAssignee(lead: Assignment, userId?: string): boolean {
  return !!userId && leadAssignees(lead).some((person) => person.id === userId);
}

export function leadAssigneeNames(lead: Assignment): string {
  return leadAssignees(lead).map((person) => person.name).join(" + ") || lead.assigned_to_name || "";
}
