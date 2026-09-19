import { MODELS, type MeDTO, type ModelId } from "@relay/types";
import { router } from "expo-router";
import { useState } from "react";
import { api, ApiError } from "../src/lib/api";
import { MODEL_INFO } from "../src/lib/models";
import { useMe, useSession } from "../src/lib/session";
import { Button, Card, OptionCard, Screen, Stack, Text } from "../src/ui";
import { PageHeader } from "../src/ui/nav";

export default function ModelScreen() {
  const me = useMe();
  const { setMe } = useSession();
  const [choice, setChoice] = useState<ModelId>(me.defaultModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      setMe(await api<MeDTO>("/v1/me", { method: "PATCH", body: { defaultModel: choice } }));
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      footer={<Button label="Save" block disabled={choice === me.defaultModel} loading={saving} onPress={save} />}
    >
      <PageHeader back title="Default model" body="Answers every text without a prefix. Calls use its faster sibling." />
      <Stack gap={3}>
        {MODELS.map((m) => (
          <OptionCard
            key={m}
            selected={choice === m}
            onPress={() => setChoice(m)}
            title={`${MODEL_INFO[m].name} · ${MODEL_INFO[m].by}`}
            badge={MODEL_INFO[m].prefix}
            subtitle={MODEL_INFO[m].blurb}
          />
        ))}
      </Stack>
      <Card>
        <Text variant="body" color="textMuted">
          Start any text with a prefix to use a different model for that message, like "@web is Costco open today?"
        </Text>
      </Card>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
