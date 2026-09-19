import { MODELS, type MeDTO, type ModelId } from "@relay/types";
import { router } from "expo-router";
import { useState } from "react";
import { api, ApiError } from "../src/lib/api";
import { ACCESS_LABEL, canUse, MODEL_INFO, modelAccess, modelTitle } from "../src/lib/models";
import { requireSession, useMe, useSession } from "../src/lib/session";
import { Button, Card, OptionCard, Screen, Stack, Text } from "../src/ui";
import { PageHeader } from "../src/ui/nav";

function ModelScreen() {
  const me = useMe();
  const { setMe } = useSession();
  const [choice, setChoice] = useState<ModelId>(me.defaultModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const me = await api<MeDTO>("/v1/me", { method: "PATCH", body: { defaultModel: choice } });
      setMe(me);
      if (canUse(me, choice)) router.back();
      else router.replace(`/ai/${choice}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      footer={
        <Button
          label={canUse(me, choice) ? "Save" : `Save and connect ${MODEL_INFO[choice].name}`}
          block
          disabled={choice === me.defaultModel}
          loading={saving}
          onPress={save}
        />
      }
    >
      <PageHeader back title="Default model" body="Answers every text without a prefix. Calls use its faster sibling." />
      <Stack gap={3}>
        {MODELS.map((m) => (
          <OptionCard
            key={m}
            selected={choice === m}
            onPress={() => setChoice(m)}
            title={modelTitle(m)}
            badge={MODEL_INFO[m].prefix}
            subtitle={`${ACCESS_LABEL[modelAccess(me, m)]}. ${MODEL_INFO[m].blurb}`}
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

export default requireSession(ModelScreen);
