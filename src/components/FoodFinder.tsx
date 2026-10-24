import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  MultiSelect,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconSearch,
  IconSelector,
  IconStar,
  IconStarFilled,
  IconTag,
  IconTrash,
  IconWorldSearch,
} from "@tabler/icons-react";
import type { Food } from "../../shared/types.ts";
import { api } from "../api.ts";
import { fmtG, foodKey, notifyError } from "../format.ts";
import { CustomFoodModal } from "./CustomFoodModal.tsx";

type SortKey = "name" | "brand" | "calories" | "protein" | "carbs" | "fat";
type Sort = { key: SortKey; desc: boolean } | null;

interface Props {
  selected: Food | null;
  onSelect: (food: Food) => void;
}

export function FoodFinder({ selected, onSelect }: Props) {
  const [tab, setTab] = useState<string | null>("search");
  const [customFoods, setCustomFoods] = useState<Food[]>([]);
  const [creating, setCreating] = useState(false);

  const loadCustomFoods = useCallback(() => {
    api.customFoods().then(setCustomFoods, (e) => notifyError(e, "Could not load your saved foods"));
  }, []);
  useEffect(loadCustomFoods, [loadCustomFoods]);

  const savedKeys = useMemo(() => new Set(customFoods.map(foodKey)), [customFoods]);

  async function favourite(food: Food) {
    try {
      const { saved } = await api.saveCustomFood(food);
      notifications.show({ message: saved ? `Saved "${food.name}" to My foods.` : `"${food.name}" is already in My foods.` });
      loadCustomFoods();
    } catch (e) {
      notifyError(e, "Could not save the food");
    }
  }

  function confirmRemove(food: Food) {
    modals.openConfirmModal({
      title: "Remove from My foods",
      children: (
        <Text size="sm">
          Remove <b>{food.name}</b> from your saved foods? Entries already in your log are not affected.
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () =>
        food.id != null && api.removeCustomFood(food.id).then(loadCustomFoods, (e) => notifyError(e, "Could not remove the food")),
    });
  }

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs">
      <Group justify="space-between" mb="md">
        <Title order={4}>Find a food</Title>
        <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
          New custom food
        </Button>
      </Group>

      <Tabs value={tab} onChange={setTab} keepMounted>
        <Tabs.List mb="md">
          <Tabs.Tab value="search" leftSection={<IconWorldSearch size={16} />}>
            Search online
          </Tabs.Tab>
          <Tabs.Tab
            value="mine"
            leftSection={<IconStar size={16} />}
            rightSection={
              <Badge size="xs" variant="light" circle={customFoods.length < 10}>
                {customFoods.length}
              </Badge>
            }
          >
            My foods
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="search">
          <OnlineSearch selected={selected} onSelect={onSelect} savedKeys={savedKeys} onFavourite={favourite} />
        </Tabs.Panel>
        <Tabs.Panel value="mine">
          <MyFoods foods={customFoods} selected={selected} onSelect={onSelect} onRemove={confirmRemove} onCreate={() => setCreating(true)} />
        </Tabs.Panel>
      </Tabs>

      <CustomFoodModal
        opened={creating}
        onClose={() => setCreating(false)}
        onCreated={(food, saved) => {
          onSelect(food);
          if (saved) loadCustomFoods();
        }}
      />
    </Paper>
  );
}

// ---- Online search ------------------------------------------------------------------------

function OnlineSearch({
  selected,
  onSelect,
  savedKeys,
  onFavourite,
}: {
  selected: Food | null;
  onSelect: (food: Food) => void;
  savedKeys: Set<string>;
  onFavourite: (food: Food) => void;
}) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [debouncedBrand] = useDebouncedValue(brand.trim(), 300);

  const [results, setResults] = useState<Food[] | null>(null);
  const [searched, setSearched] = useState({ q: "", brand: "", page: 0, hasMore: false });
  const [loading, setLoading] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (debouncedBrand.length < 2) {
      setBrandOptions([]);
      return;
    }
    let cancelled = false;
    api.brands(debouncedBrand).then(
      (b) => !cancelled && setBrandOptions(b),
      () => !cancelled && setBrandOptions([]),
    );
    return () => {
      cancelled = true;
    };
  }, [debouncedBrand]);

  async function runSearch(q: string, b: string, page: number) {
    const id = ++requestId.current;
    setLoading(page === 1 ? "search" : "more");
    setError(null);
    try {
      const res = await api.search(q, b, page);
      if (id !== requestId.current) return;
      setResults((prev) => (page === 1 ? res.foods : [...(prev ?? []), ...res.foods]));
      setSearched({ q, brand: b, page, hasMore: res.hasMore });
      if (page === 1) {
        setBrandFilter([]);
        setSort(null);
      }
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : String(e));
      if (page === 1) setResults(null);
    } finally {
      if (id === requestId.current) setLoading(null);
    }
  }

  const brands = useMemo(
    () => [...new Set((results ?? []).map((f) => f.brand.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [results],
  );
  const visible = useMemo(
    () => (results ?? []).filter((f) => !brandFilter.length || brandFilter.includes(f.brand.trim())),
    [results, brandFilter],
  );

  return (
    <Stack gap="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim() || brand.trim()) void runSearch(query.trim(), brand.trim(), 1);
        }}
      >
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <TextInput
            flex={3}
            label="Food"
            placeholder="e.g. greek yoghurt"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <Autocomplete
            flex={2}
            label="Brand (optional)"
            placeholder="e.g. Tesco"
            leftSection={<IconTag size={16} />}
            value={brand}
            onChange={setBrand}
            data={brandOptions}
            filter={({ options }) => options}
            limit={20}
          />
          <Button type="submit" loading={loading === "search"} disabled={!query.trim() && !brand.trim()}>
            Search
          </Button>
        </Group>
      </form>

      {error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Online search failed">
          {error} Check your internet connection and try again.
        </Alert>
      )}

      {results === null && !loading && !error && (
        <EmptyState
          icon={<IconWorldSearch size={36} stroke={1.4} />}
          title="Search Open Food Facts"
          text="Search by food, brand, or both. Nutrients are shown per 100 g. Entries can be user-submitted, so check packaging when accuracy matters."
        />
      )}

      {loading === "search" && (
        <Center py={60}>
          <Loader type="dots" />
        </Center>
      )}

      {results !== null && loading !== "search" && (
        <>
          <Group justify="space-between" align="flex-end" wrap="nowrap">
            <MultiSelect
              flex={1}
              placeholder={brandFilter.length ? undefined : "Filter loaded results by brand"}
              data={brands}
              value={brandFilter}
              onChange={setBrandFilter}
              searchable
              clearable
              size="xs"
              maxDropdownHeight={260}
              disabled={!brands.length}
            />
            <Badge variant="light" size="lg" style={{ flexShrink: 0 }}>
              {brandFilter.length ? `${visible.length} of ${results.length}` : results.length} results
            </Badge>
          </Group>
          <FoodTable
            foods={visible}
            sort={sort}
            onSort={setSort}
            selected={selected}
            onSelect={onSelect}
            empty="No foods with calorie data found. Try another search or add a custom food."
            action={(food) => {
              const saved = savedKeys.has(foodKey(food));
              return (
                <Tooltip label={saved ? "In My foods" : "Save to My foods"}>
                  <ActionIcon
                    variant="subtle"
                    color="yellow"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!saved) onFavourite(food);
                    }}
                    aria-label="Save to My foods"
                  >
                    {saved ? <IconStarFilled size={16} /> : <IconStar size={16} />}
                  </ActionIcon>
                </Tooltip>
              );
            }}
          />
          {searched.hasMore && (
            <Button
              variant="light"
              color="gray"
              loading={loading === "more"}
              onClick={() => void runSearch(searched.q, searched.brand, searched.page + 1)}
            >
              Load more results
            </Button>
          )}
        </>
      )}
    </Stack>
  );
}

// ---- Saved foods --------------------------------------------------------------------------

function MyFoods({
  foods,
  selected,
  onSelect,
  onRemove,
  onCreate,
}: {
  foods: Food[];
  selected: Food | null;
  onSelect: (food: Food) => void;
  onRemove: (food: Food) => void;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>(null);
  const needle = filter.trim().toLowerCase();
  const visible = needle ? foods.filter((f) => `${f.name} ${f.brand}`.toLowerCase().includes(needle)) : foods;

  if (!foods.length) {
    return (
      <EmptyState
        icon={<IconStar size={36} stroke={1.4} />}
        title="No saved foods yet"
        text="Star a search result, or create a custom food from a nutrition label, to keep it here."
        action={
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={onCreate}>
            New custom food
          </Button>
        }
      />
    );
  }

  return (
    <Stack gap="sm">
      <TextInput
        placeholder="Filter my foods"
        leftSection={<IconSearch size={16} />}
        value={filter}
        onChange={(e) => setFilter(e.currentTarget.value)}
      />
      <FoodTable
        foods={visible}
        sort={sort}
        onSort={setSort}
        selected={selected}
        onSelect={onSelect}
        empty="No saved foods match that filter."
        action={(food) => (
          <Tooltip label="Remove from My foods">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(food);
              }}
              aria-label="Remove from My foods"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      />
    </Stack>
  );
}

// ---- Shared pieces ------------------------------------------------------------------------

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Food" },
  { key: "calories", label: "kcal", numeric: true },
  { key: "protein", label: "Protein", numeric: true },
  { key: "carbs", label: "Carbs", numeric: true },
  { key: "fat", label: "Fat", numeric: true },
];

function sortFoods(foods: Food[], sort: Sort): Food[] {
  if (!sort) return foods;
  const dir = sort.desc ? -1 : 1;
  return [...foods].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * dir;
  });
}

function sameFood(a: Food | null, b: Food) {
  return !!a && a.source === b.source && foodKey(a) === foodKey(b) && a.calories === b.calories;
}

function FoodTable({
  foods,
  sort,
  onSort,
  selected,
  onSelect,
  action,
  empty,
}: {
  foods: Food[];
  sort: Sort;
  onSort: (s: Sort) => void;
  selected: Food | null;
  onSelect: (food: Food) => void;
  action: (food: Food) => ReactNode;
  empty: string;
}) {
  const rows = useMemo(() => sortFoods(foods, sort), [foods, sort]);

  if (!foods.length) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="xl">
        {empty}
      </Text>
    );
  }

  const toggle = (key: SortKey) =>
    onSort(sort?.key !== key ? { key, desc: key !== "name" } : sort.desc === (key !== "name") ? { key, desc: !sort.desc } : null);

  return (
    <ScrollArea h={460} type="auto" offsetScrollbars>
      <Table stickyHeader highlightOnHover={false} verticalSpacing={8} fz="sm">
        <Table.Thead>
          <Table.Tr>
            {COLUMNS.map((c) => {
              const Icon = sort?.key === c.key ? (sort.desc ? IconChevronDown : IconChevronUp) : IconSelector;
              return (
                <Table.Th key={c.key} ta={c.numeric ? "right" : undefined} w={c.numeric ? 76 : undefined}>
                  <UnstyledButton onClick={() => toggle(c.key)} fw={600} fz="sm">
                    <Group gap={2} wrap="nowrap" justify={c.numeric ? "flex-end" : undefined}>
                      {c.label}
                      <Icon size={14} opacity={sort?.key === c.key ? 1 : 0.4} />
                    </Group>
                  </UnstyledButton>
                </Table.Th>
              );
            })}
            <Table.Th w={44} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((food, i) => (
            <Table.Tr
              key={`${foodKey(food)}|${i}`}
              className="clickable-row"
              data-selected={sameFood(selected, food) || undefined}
              onClick={() => onSelect(food)}
            >
              <Table.Td>
                <Box maw={320}>
                  <Text size="sm" fw={500} lineClamp={1}>
                    {food.name}
                  </Text>
                  {food.brand && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {food.brand}
                    </Text>
                  )}
                </Box>
              </Table.Td>
              <Table.Td ta="right" fw={600}>
                {Math.round(food.calories)}
              </Table.Td>
              <Table.Td ta="right">{fmtG(food.protein)}</Table.Td>
              <Table.Td ta="right">{fmtG(food.carbs)}</Table.Td>
              <Table.Td ta="right">{fmtG(food.fat)}</Table.Td>
              <Table.Td>{action(food)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <Center py={48}>
      <Stack align="center" gap={6} maw={380}>
        <Box c="dimmed">{icon}</Box>
        <Text fw={600}>{title}</Text>
        <Text size="sm" c="dimmed" ta="center">
          {text}
        </Text>
        {action && <Box mt="xs">{action}</Box>}
      </Stack>
    </Center>
  );
}
