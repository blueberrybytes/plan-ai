import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Text, useTheme } from "react-native-paper";
import { useDrawerStatus } from "@react-navigation/drawer";
import { useAuth } from "../context/AuthContext";
import {
  refreshPendingProposalCount,
  usePendingProposalCount,
} from "../services/trackersStore";

/**
 * "Trackers" in the drawer, with the number of proposals that wait to be
 * reviewed. The count is asked again each time the drawer opens.
 */
export function TrackersDrawerLabel({ color }: { color: string }) {
  const theme = useTheme();
  const { api } = useAuth();
  const count = usePendingProposalCount();
  const drawerStatus = useDrawerStatus();

  useEffect(() => {
    if (drawerStatus === "open") void refreshPendingProposalCount(api);
  }, [drawerStatus, api]);

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color }]}>Trackers</Text>
      {count > 0 && (
        <Badge
          size={20}
          style={{ backgroundColor: theme.colors.primary, color: theme.colors.onPrimary }}
          accessibilityLabel={`${count} to review`}
        >
          {count > 99 ? 99 : count}
        </Badge>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flex: 1 },
  label: { fontSize: 14, fontWeight: "500" },
});
