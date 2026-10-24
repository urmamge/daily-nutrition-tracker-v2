import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Box,
  Container,
  Group,
  SegmentedControl,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconMoon, IconSalad, IconSun } from "@tabler/icons-react";
import type { SyncStatus } from "../shared/types.ts";
import { DayView } from "./components/DayView.tsx";
import { HistoryView } from "./components/HistoryView.tsx";
import { notifyError, todayIso } from "./format.ts";

type View = "log" | "history";

function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const lastError = useRef<string | null>(null);
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("sync", (e) => {
      const next: SyncStatus = JSON.parse((e as MessageEvent).data);
      if (next.error && next.error !== lastError.current) notifyError(next.error, "Website sync failed");
      lastError.current = next.error;
      setStatus(next);
    });
    return () => events.close();
  }, []);
  return status;
}

export function App() {
  const [view, setView] = useLocalStorage<View>({ key: "ndt-view", defaultValue: "log" });
  const [date, setDate] = useState(todayIso);
  const [logVersion, setLogVersion] = useState(0);
  const sync = useSyncStatus();
  const { toggleColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");

  return (
    <AppShell header={{ height: 68 }} padding="lg">
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: "violet", to: "grape", deg: 135 }}>
                <IconSalad size={24} />
              </ThemeIcon>
              <div>
                <Title order={4} lh={1.15}>
                  Daily Nutrition Tracker
                </Title>
                <Text size="xs" c="dimmed" visibleFrom="sm">
                  Search foods · Log portions · Review your history
                </Text>
              </div>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <SegmentedControl
                value={view}
                onChange={(v) => setView(v as View)}
                data={[
                  { value: "log", label: "Food log" },
                  { value: "history", label: "History & averages" },
                ]}
              />
              <Tooltip label={scheme === "dark" ? "Light mode" : "Dark mode"}>
                <ActionIcon variant="default" size="lg" onClick={toggleColorScheme} aria-label="Toggle colour scheme">
                  {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
        <Container size="xl" pb="xl">
          {/* Both views stay mounted so search results survive switching tabs. */}
          <Box display={view === "log" ? undefined : "none"}>
            <DayView date={date} onDateChange={setDate} onLogChanged={() => setLogVersion((v) => v + 1)} />
          </Box>
          <Box display={view === "history" ? undefined : "none"}>
            <HistoryView
              logVersion={logVersion}
              sync={sync}
              onOpenDay={(d) => {
                setDate(d);
                setView("log");
              }}
            />
          </Box>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
