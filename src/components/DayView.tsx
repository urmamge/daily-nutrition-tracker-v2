import { useCallback, useEffect, useState } from "react";
import { ActionIcon, Button, Grid, Group, Stack, Title, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { DayLog, Food } from "../../shared/types.ts";
import { api } from "../api.ts";
import { dayLabel, notifyError, shiftDate, todayIso } from "../format.ts";
import { AddToLog } from "./AddToLog.tsx";
import { DaySummary } from "./DaySummary.tsx";
import { FoodFinder } from "./FoodFinder.tsx";
import { FoodLog } from "./FoodLog.tsx";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  onLogChanged: () => void;
}

export function DayView({ date, onDateChange, onLogChanged }: Props) {
  const [day, setDay] = useState<DayLog | null>(null);
  const [selected, setSelected] = useState<Food | null>(null);

  const load = useCallback(() => {
    api.day(date).then(setDay, (e) => notifyError(e, "Could not load the food log"));
  }, [date]);
  useEffect(load, [load]);

  const changed = () => {
    load();
    onLogChanged();
  };

  const isToday = date === todayIso();

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>{dayLabel(date)}</Title>
        <Group gap="xs">
          <Tooltip label="Previous day">
            <ActionIcon variant="default" size="lg" onClick={() => onDateChange(shiftDate(date, -1))} aria-label="Previous day">
              <IconChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <DatePickerInput
            value={date}
            onChange={(v) => v && onDateChange(v)}
            valueFormat="ddd D MMM YYYY"
            leftSection={<IconCalendar size={16} />}
            w={190}
          />
          <Tooltip label="Next day">
            <ActionIcon variant="default" size="lg" onClick={() => onDateChange(shiftDate(date, 1))} aria-label="Next day">
              <IconChevronRight size={18} />
            </ActionIcon>
          </Tooltip>
          <Button variant="light" disabled={isToday} onClick={() => onDateChange(todayIso())}>
            Today
          </Button>
        </Group>
      </Group>

      <DaySummary day={day} />

      <Grid gap="lg" align="flex-start">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <FoodFinder selected={selected} onSelect={setSelected} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="lg">
            <AddToLog food={selected} date={date} onAdded={changed} />
            <FoodLog day={day} onRemoved={changed} />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
