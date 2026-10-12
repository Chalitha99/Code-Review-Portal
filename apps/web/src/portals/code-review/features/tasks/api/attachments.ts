import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { taskAttachmentSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { taskKeys } from '@/portals/code-review/hooks/useTasks.ts';

/**
 * Managing the developer's supporting images.
 *
 * All three mutations return the whole collection, so the cache is replaced
 * rather than patched — the server owns ordering and ids, and mirroring its
 * answer avoids the list disagreeing with it after a failed optimistic update.
 *
 * Reading them lives in `hooks/useTasks.ts`, because the reviewer reads the same
 * rows.
 *
 * NOTE: these three WRITE hooks currently have no call site. The wizard's
 * screenshot dropzone was withdrawn from step 3 at the business's request, and
 * the NestJS endpoints, the schema and the read path all remain — so the developer
 * upload surface is a component away, not a feature away, if it is asked for
 * again. The reads (`useTaskAttachments`) are very much live: `ReviewTaskPage`
 * and `TaskDetailPage` both render the attachments a task already has.
 */

const attachmentListSchema = z.array(taskAttachmentSchema);

function useAttachmentMutation<TInput>(
  taskId: string,
  request: (input: TInput) => Promise<z.infer<typeof attachmentListSchema>>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: (attachments) => {
      queryClient.setQueryData(taskKeys.attachments(taskId), attachments);
    },
  });
}

export function useAddAttachment(taskId: string) {
  return useAttachmentMutation(
    taskId,
    (file: { fileName: string; sizeBytes: number; mimeType: string; dataUrl: string }) =>
      api.post(`/tasks/${taskId}/attachments`, attachmentListSchema, file),
  );
}

export function useCaptionAttachment(taskId: string) {
  return useAttachmentMutation(
    taskId,
    ({ attachmentId, caption }: { attachmentId: string; caption: string }) =>
      api.patch(`/tasks/${taskId}/attachments/${attachmentId}`, attachmentListSchema, { caption }),
  );
}

export function useRemoveAttachment(taskId: string) {
  return useAttachmentMutation(taskId, (attachmentId: string) =>
    api.delete(`/tasks/${taskId}/attachments/${attachmentId}`, attachmentListSchema),
  );
}
