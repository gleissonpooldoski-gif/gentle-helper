import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense } from "react";

const EditorClient = lazy(() =>
  import("@/components/visual-templates/EditorClient").then((m) => ({ default: m.EditorClient })),
);

import {
  getVisualTemplate,
  saveVisualTemplate,
  duplicateVisualTemplate,
  setDefaultVisualTemplate,
  listChannelProductsLite,
} from "@/modules/visual-templates/templates.functions";

export const Route = createFileRoute("/templates/editor/$id")({
  component: EditorPage,
  head: () => ({
    meta: [
      { title: "Editor visual — Templates" },
      { name: "description", content: "Editor drag and drop de artes para afiliados." },
      { property: "og:title", content: "Editor visual" },
      { property: "og:description", content: "Monte artes visuais sem código." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getVisualTemplate);
  const save = useServerFn(saveVisualTemplate);
  const dup = useServerFn(duplicateVisualTemplate);
  const setDef = useServerFn(setDefaultVisualTemplate);
  const listProducts = useServerFn(listChannelProductsLite);

  const tpl = useQuery({
    queryKey: ["visual_template", id],
    queryFn: () => get({ data: { id } }),
  });
  const products = useQuery({
    queryKey: ["visual_template_products", tpl.data?.channel_id ?? null],
    queryFn: () => listProducts({ data: { channelId: tpl.data?.channel_id ?? null } }),
    enabled: tpl.isSuccess,
  });

  const saveMut = useMutation({
    mutationFn: (patch: {
      name?: string;
      elements?: unknown[];
      preview_url?: string | null;
    }) =>
      save({
        data: {
          id,
          name: patch.name,
          elements: patch.elements as never,
          preview_url: patch.preview_url,
        },
      }),
  });

  if (tpl.isLoading || !tpl.data) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando editor...</div>;
  }

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Carregando canvas...</div>}>
      <EditorClient
        template={tpl.data}
        products={products.data ?? []}
        onSave={(patch) => saveMut.mutate(patch)}
        onDuplicate={async () => {
          const { id: newId } = await dup({ data: { id } });
          navigate({ to: "/templates/editor/$id", params: { id: newId } });
        }}
        onSetDefault={async () => {
          await setDef({ data: { id } });
        }}
        onBack={() => navigate({ to: "/templates" })}
      />
    </Suspense>
  );
}
