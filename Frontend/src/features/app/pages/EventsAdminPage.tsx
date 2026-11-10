import { ManagementWorkspace } from "../../../components/ManagementWorkspace";

export function EventsAdminPage() {
  return (
    <ManagementWorkspace
      path="/events/manage"
      title="Events"
      description="Create and manage award events, venues, schedules and ticketing."
      columns={["title", "venue", "starts_at", "status", "ticketing_enabled"]}
      createEndpoint="/events"
      editEndpoint={(id) => `/events/${id}`}
      createPermission="events.manage"
      editPermission="events.manage"
      createFields={[
        {
          name: "edition_id",
          label: "Award edition",
          type: "lookup",
          required: true,
          lookup: {
            endpoint: "/awards/editions",
            valueField: "id",
            valueType: "number",
            labelFields: ["name", "year"],
          },
        },
        { name: "title", label: "Event title", required: true, maxLength: 190 },
        { name: "slug", label: "URL slug", required: true, maxLength: 190 },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          maxLength: 100000,
        },
        { name: "venue", label: "Venue", maxLength: 255 },
        { name: "address", label: "Address", maxLength: 255 },
        {
          name: "starts_at",
          label: "Starts at",
          type: "datetime-local",
          required: true,
        },
        { name: "ends_at", label: "Ends at", type: "datetime-local" },
        { name: "is_grand_finale", label: "Grand finale", type: "checkbox" },
        {
          name: "ticketing_enabled",
          label: "Enable ticketing",
          type: "checkbox",
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "draft", label: "Draft" },
            { value: "published", label: "Published" },
            { value: "sold_out", label: "Sold out" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ],
        },
      ]}
    />
  );
}
