import type { MeDTO } from "@relay/types";
import { router } from "expo-router";
import { useState } from "react";
import { api, ApiError } from "../src/lib/api";
import { useMe, useSession } from "../src/lib/session";
import { Button, Field, Screen } from "../src/ui";
import { PageHeader } from "../src/ui/nav";

export default function Profile() {
  const me = useMe();
  const { setMe } = useSession();
  const [name, setName] = useState(me.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim().length > 0 && name.trim() !== me.name;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      setMe(await api<MeDTO>("/v1/me", { method: "PATCH", body: { name: name.trim() } }));
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen keyboard footer={<Button label="Save" block disabled={!changed} loading={saving} onPress={save} />}>
      <PageHeader back title="Your name" body="Relay uses it when it signs emails and books things for you." />
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        autoFocus
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="done"
        onSubmitEditing={() => changed && void save()}
        error={error}
      />
    </Screen>
  );
}
