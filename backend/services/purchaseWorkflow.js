const ACTIVE_ORDER_STATES = new Set(['ordered', 'partially_received']);
const CANCELLABLE_STATES = new Set(['pending', 'approved', 'ordered', 'partially_received']);

export function validatePurchaseTransition(request, body, role, now = new Date()) {
  if (!request) return { status: 404, error: 'Purchase request not found in this workspace.' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, error: 'Provide a purchase status transition.' };
  }
  const nextStatus = body.status;
  const currentStatus = String(request.status || '');
  const note = body.note === undefined ? '' : body.note;
  if (typeof note !== 'string' || note.trim().length > 500) {
    return { status: 400, error: 'Transition note must be text up to 500 characters.' };
  }

  const patch = { status: nextStatus };
  const manager = ['owner', 'admin'].includes(role);
  const receiver = ['owner', 'admin', 'staff'].includes(role);

  if (nextStatus === 'cancelled') {
    if (!manager) return { status: 403, error: 'Only owners and admins can cancel a purchase request.' };
    if (!CANCELLABLE_STATES.has(currentStatus)) {
      return { status: 409, error: 'This purchase request can no longer be cancelled.' };
    }
    patch.cancelledAt = now;
  } else if (nextStatus === 'ordered') {
    if (!manager) return { status: 403, error: 'Only owners and admins can mark an approved request as ordered.' };
    if (currentStatus !== 'approved') {
      return { status: 409, error: 'Only approved requests can be marked as ordered.' };
    }
    const orderedQuantity = body.orderedQuantity === undefined ? Number(request.quantity) : Number(body.orderedQuantity);
    if (!Number.isSafeInteger(orderedQuantity) || orderedQuantity < 1 || orderedQuantity > Number(request.quantity)) {
      return { status: 400, error: 'Ordered quantity must be a whole number between 1 and the requested quantity.' };
    }
    patch.orderedQuantity = orderedQuantity;
    patch.receivedQuantity = Number(request.receivedQuantity || 0);
    patch.orderedAt = now;
  } else if (nextStatus === 'partially_received' || nextStatus === 'received') {
    if (!receiver) return { status: 403, error: 'Your role cannot record receipt of goods.' };
    if (!ACTIVE_ORDER_STATES.has(currentStatus)) {
      return { status: 409, error: 'Only ordered or partially received requests can record goods receipt.' };
    }
    const orderedQuantity = Number(request.orderedQuantity || request.quantity);
    const previousReceived = Number(request.receivedQuantity || 0);
    const receivedQuantity = Number(body.receivedQuantity);
    if (!Number.isSafeInteger(receivedQuantity) || receivedQuantity <= previousReceived || receivedQuantity > orderedQuantity) {
      return { status: 400, error: 'Total received quantity must be a whole number above the current received quantity and no greater than the ordered quantity.' };
    }
    if (nextStatus === 'partially_received' && receivedQuantity >= orderedQuantity) {
      return { status: 400, error: 'Use received when the complete ordered quantity has arrived.' };
    }
    if (nextStatus === 'received' && receivedQuantity !== orderedQuantity) {
      return { status: 400, error: 'A request can be marked received only when all ordered units are recorded.' };
    }
    patch.orderedQuantity = orderedQuantity;
    patch.receivedQuantity = receivedQuantity;
    if (nextStatus === 'received') patch.receivedAt = now;
  } else {
    return { status: 400, error: 'Supported transitions are ordered, partially_received, received, and cancelled.' };
  }

  return {
    patch,
    history: {
      status: nextStatus,
      changedBy: request.actorId || null,
      changedAt: now,
      note: note.trim()
    }
  };
}
