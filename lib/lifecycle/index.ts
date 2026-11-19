import { ComplaintStatus, UserRole } from '../types/civic';

/**
 * Department Routing & Strict Complaint Lifecycle Validator (Phase 5)
 *
 * Enforces:
 * - Responsible municipal department routing based on civic category/class
 * - Backend state transition validation
 * - Authority CANNOT directly mark a complaint 'Resolved' or 'Closed';
 *   resolution MUST happen via the 3-gate RVE or Admin manual review.
 */

export const DEPARTMENT_ROUTING_MAP: Record<string, string> = {
  pothole: 'Public Works Department (PWD - Road Maintenance Division)',
  'Roads & Infrastructure': 'Public Works Department (PWD - Road Maintenance Division)',
  garbage: 'Municipal Solid Waste Management (Sanitation Dept)',
  'Waste & Sanitation': 'Municipal Solid Waste Management (Sanitation Dept)',
  water_logging: 'Water Supply & Sewage Board / Drainage Division',
  'Water & Drainage': 'Water Supply & Sewage Board / Drainage Division',
  'Power & Street Lighting': 'Municipal Electrical & Street Lighting Division',
  'Traffic & Public Transit': 'Traffic Engineering & Public Transit Authority',
  'Parks & Public Spaces': 'Municipal Parks & Horticulture Department',
  'Public Safety & Vandalism': 'Municipal Civic Enforcement & Safety Cell',
};

export function routeToDepartment(categoryOrClass: string): string {
  return (
    DEPARTMENT_ROUTING_MAP[categoryOrClass] ||
    'Municipal General Civic Works & Redressal Cell'
  );
}

const ALLOWED_AUTHORITY_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  Submitted: ['Assigned', 'Acknowledged', 'In Progress'],
  Assigned: ['Acknowledged', 'In Progress'],
  Acknowledged: ['In Progress'],
  'In Progress': ['Under Verification'],
  'Under Verification': [],
  Rejected: ['Acknowledged', 'In Progress'],
  Resolved: [],
  Closed: [],
};

export interface TransitionValidationResult {
  allowed: boolean;
  reason?: string;
}

export function validateStatusTransition(params: {
  actorRole: UserRole | 'rve';
  currentStatus: ComplaintStatus;
  targetStatus: ComplaintStatus;
  viaRve?: boolean;
}): TransitionValidationResult {
  const { actorRole, currentStatus, targetStatus, viaRve } = params;

  // Citizens cannot mutate lifecycle statuses directly
  if (actorRole === 'citizen') {
    return {
      allowed: false,
      reason: 'Unauthorized: Citizens cannot alter complaint lifecycle status.',
    };
  }

  // Strictly block Authority from marking Resolved/Closed without passing RVE
  if (
    actorRole === 'authority' &&
    (targetStatus === 'Resolved' || targetStatus === 'Closed') &&
    !viaRve
  ) {
    return {
      allowed: false,
      reason:
        'RVE Policy Violation: Authorities cannot directly mark a complaint Resolved or Closed. Submit a 30-second live video through the Resolution Verification Engine (RVE).',
    };
  }

  if (actorRole === 'rve' && viaRve) {
    if (targetStatus === 'Resolved' || targetStatus === 'Closed' || targetStatus === 'Rejected') {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Invalid RVE target status: ${targetStatus}`,
    };
  }

  if (actorRole === 'admin') {
    if (targetStatus === 'Resolved' || targetStatus === 'Closed' || targetStatus === 'Rejected' || targetStatus === 'In Progress') {
      return { allowed: true };
    }
  }

  if (actorRole === 'authority') {
    const allowedTargets = ALLOWED_AUTHORITY_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(targetStatus)) {
      return {
        allowed: false,
        reason: `Invalid lifecycle transition for Field Authority: '${currentStatus}' -> '${targetStatus}' is not permitted.`,
      };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Transition not authorized for actor role.' };
}
