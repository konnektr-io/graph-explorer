import { useState, type MouseEvent, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDeleteDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown at the top of the dialog. */
  title: string;
  /** Body copy explaining what will be destroyed. */
  description: ReactNode;
  /** Label of the confirm button (verb, not the object). */
  confirmLabel: string;
  /**
   * Performs the deletion. Receives no arguments — the caller closes over the
   * entity being deleted. Throwing keeps the dialog open and surfaces the
   * message, so a failed delete never looks like a success.
   */
  onConfirm: () => Promise<void>;
  /** Error from the last `onConfirm` attempt; hidden when null. */
  error?: string | null;
}

/**
 * Confirmation dialog for a destructive action.
 *
 * Three things a raw `AlertDialog` does not give you, and that every delete in
 * this app needs:
 *
 * 1. **The error is shown in the dialog, not behind a toast.** The store also
 *    routes errors to `GlobalErrorToaster`, so a failure would otherwise leave
 *    the user looking at a closed dialog wondering whether it worked. The
 *    dialog stays open with the message until they retry or dismiss.
 * 2. **The confirm button is disabled while the request is in flight**, so a
 *    double-click cannot issue the same delete twice.
 * 3. **In-flight state is internal.** Callers only pass a callback.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  error,
}: ConfirmDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async (event: MouseEvent) => {
    // Radix closes the dialog when the action is clicked unless the default is
    // prevented. Closing is the caller's decision — on success it closes the
    // dialog, on failure this keeps it open with the error visible. Without
    // this, a failed delete silently looks like it worked.
    event.preventDefault();

    setIsDeleting(true);
    try {
      await onConfirm();
      // The caller owns closing; a throw keeps the dialog open with the error.
    } catch {
      // Error is rendered from the `error` prop.
    } finally {
      setIsDeleting(false);
    }
  };

  // A pending delete must not be dismissible — the user would lose sight of
  // the request they just started.
  const handleOpenChange = (next: boolean) => {
    if (isDeleting && !next) return;
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded break-words">
            {error}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
