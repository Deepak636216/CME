import { useParams } from "react-router";
import { Placeholder } from "./Placeholder.tsx";

export function EventDetailPage() {
  const { kind, id } = useParams();
  return <Placeholder title={`${kind} ${id}`} phase="Phase 4" />;
}
