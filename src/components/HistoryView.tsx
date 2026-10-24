import { useEffect, useMemo, useState } from "react";
import { Button, Group, NumberInput, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { BarChart } from "@mantine/charts";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { IconCalendar, IconDownload } from "@tabler/icons-react";
import dayjs from "dayjs";
import type { HistoryResult, SyncStatus } from "../../shared/types.ts";
import { api } from "../api.ts";
import { fmtG, fmtKcal, MACROS, notifyError, todayIso } from "../format.ts";
import { SyncCard } from "./SyncCard.tsx";

interface Props {
  logVersion: number;
  sync: SyncStatus | null;
  onOpenDay: (date: string) => void;
}

export function HistoryView({ logVersion, sync, onOpenDay }: Props) {
  const [weeks, setWeeks] = useState<number | string>(4);
  const [end, setEnd] = useState(todayIso);
  const [debouncedWeeks] = useDebouncedValue(weeks, 300);
  const [history, setHistory] = useState<HistoryResult | null>(null);

  const weeksValue = Number(debouncedWeeks);
  const validWeeks = Number.isInteger(weeksValue) && weeksValue >= 1 && weeksValue <= 104;

  useEffect(() => {
    if (!validWeeks) return;
    let cancelled = false;
    api.history(weeksValue, end).then(
      (h) => !cancelled && setHistory(h),
      (e) => notifyError(e, "Could not load history"),
    );
    return () => {
      cancelled = true;
    };
  }, [weeksValue, validWeeks, end, logVersion]);

  const chartData = useMemo(
    () =>
      [...(history?.days ?? [])].reverse().map((d) => ({ day: dayjs(d.date).format("D MMM"), calories: Math.round(d.calories) })),
    [history],
  );
  const avg = history?.averages;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>History & averages</Title>
          <Text c="dimmed" size="sm">
            {history?.start
              ? `${dayjs(history.start).format("D MMM YYYY")} – ${dayjs(history.end).format("D MMM YYYY")} · ${history.activeDays} days`
              : "No tracked days in this period"}
          </Text>
        </div>
        <Group gap="sm" align="flex-end">
          <NumberInput
            label="Period"
            suffix=" weeks"
            min={1}
            max={104}
            allowDecimal={false}
            clampBehavior="strict"
            value={weeks}
            onChange={setWeeks}
            w={130}
          />
          <DatePickerInput
            label="Ending on"
            value={end}
            onChange={(v) => v && setEnd(v)}
            valueFormat="D MMM YYYY"
            leftSection={<IconCalendar size={16} />}
            w={170}
          />
          <Button component="a" href="/api/export.csv" download variant="default" leftSection={<IconDownload size={16} />}>
            Export CSV
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <AverageCard label="Avg calories / day" value={avg ? fmtKcal(avg.calories) : "—"} unit="kcal" color="violet" />
        {MACROS.map((m) => (
          <AverageCard key={m.key} label={`Avg ${m.label.toLowerCase()} / day`} value={avg ? fmtG(avg[m.key]) : "—"} unit="g" color={m.color} />
        ))}
      </SimpleGrid>

      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Title order={4} mb="md">
          Daily calories
        </Title>
        {chartData.length ? (
          <BarChart
            h={260}
            data={chartData}
            dataKey="day"
            series={[{ name: "calories", label: "Calories", color: "violet.6" }]}
            valueFormatter={fmtKcal}
            unit=" kcal"
            yAxisProps={{ width: 70 }}
            referenceLines={
              avg ? [{ y: Math.round(avg.calories), label: `Average ${fmtKcal(avg.calories)} kcal`, color: "gray.6", labelPosition: "insideTopRight" }] : []
            }
            gridAxis="y"
            tickLine="none"
            barProps={{ radius: [4, 4, 0, 0] }}
            maxBarWidth={36}
          />
        ) : (
          <Text c="dimmed" ta="center" py="xl">
            Log some food to see your history here.
          </Text>
        )}
      </Paper>

      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Daily totals</Title>
          <Text size="xs" c="dimmed">
            Click a day to open its food log
          </Text>
        </Group>
        <ScrollArea.Autosize mah={480} type="auto" offsetScrollbars>
          <Table stickyHeader verticalSpacing={8} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th ta="right">Calories</Table.Th>
                {MACROS.map((m) => (
                  <Table.Th key={m.key} ta="right">
                    {m.label} (g)
                  </Table.Th>
                ))}
                <Table.Th ta="right">Foods</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history?.days.map((d) => (
                <Table.Tr key={d.date} className="clickable-row" onClick={() => onOpenDay(d.date)} c={d.entries ? undefined : "dimmed"}>
                  <Table.Td fw={500}>{dayjs(d.date).format("ddd D MMM YYYY")}</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {fmtKcal(d.calories)}
                  </Table.Td>
                  {MACROS.map((m) => (
                    <Table.Td key={m.key} ta="right">
                      {fmtG(d[m.key])}
                    </Table.Td>
                  ))}
                  <Table.Td ta="right">{d.entries}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Text size="xs" c="dimmed" mt="sm">
          Averages are per calendar day. Days before your first food entry are excluded; later days with nothing logged count
          as 0 kcal.
        </Text>
      </Paper>

      <SyncCard status={sync} />
    </Stack>
  );
}

function AverageCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <Paper withBorder radius="lg" p="md" shadow="xs" style={{ borderTop: `3px solid var(--mantine-color-${color}-6)` }}>
      <Text size="sm" c="dimmed" fw={500}>
        {label}
      </Text>
      <Group gap={4} align="baseline" mt={4}>
        <Text fz={28} fw={700} lh={1.1}>
          {value}
        </Text>
        <Text size="sm" c="dimmed">
          {unit}
        </Text>
      </Group>
    </Paper>
  );
}
