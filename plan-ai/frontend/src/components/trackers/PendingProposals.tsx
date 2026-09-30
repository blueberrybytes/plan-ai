import React, { useState } from "react";
import {
  useListTrackerEntriesQuery,
  useListTrackersQuery,
  useReviewTrackerEntriesMutation,
  useUpdateTrackerEntryMutation,
  type TrackerEntry,
} from "../../store/apis/trackersApi";
import ProposalList from "./ProposalList";
import { useTrackerToast } from "./useTrackerToast";

interface PendingProposalsProps {
  /** Only the proposals read from this note. All of them when left out. */
  noteId?: string;
  hideCalories: boolean;
}

/** Loads the proposals waiting for review and lets the user accept or reject them. */
const PendingProposals: React.FC<PendingProposalsProps> = ({ noteId, hideCalories }) => {
  const toast = useTrackerToast();
  const { data: entries = [] } = useListTrackerEntriesQuery(
    noteId ? { status: "PROPOSED", noteId } : { status: "PROPOSED" },
  );
  const { data: trackers = [] } = useListTrackersQuery();
  const [updateEntry] = useUpdateTrackerEntryMutation();
  const [review, { isLoading: acceptingAll }] = useReviewTrackerEntriesMutation();
  const [busyIds, setBusyIds] = useState<string[]>([]);

  const withBusy = async (entry: TrackerEntry, action: () => Promise<unknown>) => {
    setBusyIds((ids) => [...ids, entry.id]);
    try {
      await action();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusyIds((ids) => ids.filter((id) => id !== entry.id));
    }
  };

  const setStatus = (entry: TrackerEntry, status: "CONFIRMED" | "REJECTED") =>
    withBusy(entry, () => updateEntry({ id: entry.id, patch: { status } }).unwrap());

  const handleAcceptAll = async () => {
    try {
      await review({ ids: entries.map((entry) => entry.id), status: "CONFIRMED" }).unwrap();
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <ProposalList
      entries={entries}
      trackers={trackers}
      hideCalories={hideCalories}
      busyIds={busyIds}
      acceptingAll={acceptingAll}
      onAccept={(entry) => setStatus(entry, "CONFIRMED")}
      onReject={(entry) => setStatus(entry, "REJECTED")}
      onSaveValue={(entry, value) =>
        withBusy(entry, () => updateEntry({ id: entry.id, patch: { value } }).unwrap())
      }
      onAcceptAll={handleAcceptAll}
    />
  );
};

export default PendingProposals;
