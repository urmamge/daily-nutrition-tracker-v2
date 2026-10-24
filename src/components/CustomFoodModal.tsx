import { useState } from "react";
import { Button, Checkbox, Group, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import type { Food } from "../../shared/types.ts";
import { api } from "../api.ts";
import { notifyError } from "../format.ts";

const NUTRIENTS = [
  { key: "calories", label: "Calories", suffix: " kcal" },
  { key: "protein", label: "Protein", suffix: " g" },
  { key: "carbs", label: "Carbs", suffix: " g" },
  { key: "fat", label: "Fat", suffix: " g" },
] as const;

type Values = Record<(typeof NUTRIENTS)[number]["key"], number | string>;
const EMPTY: Values = { calories: "", protein: "", carbs: "", fat: "" };

interface Props {
  opened: boolean;
  onClose: () => void;
  onCreated: (food: Food, saved: boolean) => void;
}

export function CustomFoodModal({ opened, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [values, setValues] = useState<Values>(EMPTY);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  function reset() {
    setName("");
    setBrand("");
    setValues(EMPTY);
    setNameError(null);
  }

  async function submit() {
    if (!name.trim()) {
      setNameError("Enter a food name");
      return;
    }
    const nums = Object.fromEntries(NUTRIENTS.map((n) => [n.key, Number(values[n.key] || 0)])) as Record<keyof Values, number>;
    const food: Food = { name: name.trim(), brand: brand.trim(), ...nums, source: "Custom" };
    setBusy(true);
    try {
      if (save) await api.saveCustomFood(food);
      onCreated(food, save);
      reset();
      onClose();
    } catch (e) {
      notifyError(e, "Could not save the food");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="New custom food" centered radius="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Stack gap="md">
          <TextInput
            label="Food name"
            placeholder="e.g. Homemade chilli"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
              setNameError(null);
            }}
            error={nameError}
            data-autofocus
            withAsterisk
          />
          <TextInput label="Brand" placeholder="Optional" value={brand} onChange={(e) => setBrand(e.currentTarget.value)} />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Nutrition per 100 g
            </Text>
            <SimpleGrid cols={2} spacing="sm">
              {NUTRIENTS.map((n) => (
                <NumberInput
                  key={n.key}
                  label={n.label}
                  placeholder="0"
                  min={0}
                  decimalScale={1}
                  suffix={n.suffix}
                  allowNegative={false}
                  value={values[n.key]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [n.key]: v }))}
                />
              ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed" mt={6}>
              Copy these from the nutrition label on the packaging.
            </Text>
          </div>
          <Checkbox label="Save to My foods for next time" checked={save} onChange={(e) => setSave(e.currentTarget.checked)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Use this food
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
