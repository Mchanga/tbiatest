import { useState } from "react";
import { Button } from "../../../components/ui";
import { RecordList } from "../../../components/RecordList";
import { useAuth } from "../../auth/AuthProvider";

export function PaymentsPage() {
  const { user } = useAuth();
  const canViewAll = user?.permissions?.includes("payments.view") ?? false;
  const [scope, setScope] = useState<"mine" | "all">("mine");
  return (
    <>
      {canViewAll && (
        <div className="scope-switch">
          <Button
            variant={scope === "mine" ? "primary" : "secondary"}
            onClick={() => setScope("mine")}
          >
            My payments
          </Button>
          <Button
            variant={scope === "all" ? "primary" : "secondary"}
            onClick={() => setScope("all")}
          >
            All payments
          </Button>
        </div>
      )}
      <RecordList
        path={scope === "mine" ? "/payments/mine" : "/payments"}
        title="Payments"
        description="Review payment transactions visible to your account. Checkout is not available until a payment provider is integrated."
        columns={
          scope === "mine"
            ? [
                "reference_no",
                "payable_type",
                "amount",
                "currency",
                "provider",
                "status",
                "paid_at",
              ]
            : [
                "reference_no",
                "user_id",
                "payable_type",
                "amount",
                "currency",
                "status",
                "created_at",
              ]
        }
      />
    </>
  );
}
