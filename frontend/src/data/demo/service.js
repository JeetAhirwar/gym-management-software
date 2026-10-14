import { DataError } from "@/data/types";
import { buildDemoDatabase } from "@/data/demo/seed";
import { checkEligibility, computeEndDate, currentMembership, daysRemaining, effectiveStatus, membershipBalance, renewalStartDate, } from "@/lib/membership";
import { generateQrToken, tokenHint } from "@/lib/qr";
import { addDays, addMonthsClamped, hourInTz, monthKeyInTz, parseDateOnly, ymdInTz, gymTimezone, } from "@/lib/datetime";
const STORAGE_KEY = "pgs.demo.db.v3";
function iso(d) {
    return d.toISOString();
}
function ymd(d) {
    return d.toISOString().slice(0, 10);
}
function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
/** The portal contract narrows the derived status union — map into it. */
function toMyEffectiveStatus(status) {
    if (status === "active" || status === "expiring_soon" || status === "expired" || status === "none")
        return status;
    // A deactivated member / cancelled row both read as "not usable" in the portal.
    return "suspended";
}
export class DemoDataService {
    mode = "demo";
    db;
    idempotencyKeys = new Set();
    constructor(seed = buildDemoDatabase()) {
        this.db = seed;
        this.persist();
    }
    /* --------------------------- persistence --------------------------- */
    persist() {
        if (typeof window === "undefined")
            return;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
        }
        catch {
            /* quota or private mode — demo simply stays in memory */
        }
    }
    static load() {
        if (typeof window !== "undefined") {
            try {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    // Rebuild daily so "today" figures always look alive in demos.
                    const builtAt = new Date(parsed.attendance[0]?.createdAt ?? Date.now());
                    const sameDay = ymdInTz(builtAt) === ymdInTz(new Date());
                    if (parsed?.gym && sameDay)
                        return new DemoDataService(parsed);
                }
            }
            catch {
                /* corrupt storage — fall through to a fresh dataset */
            }
        }
        return new DemoDataService();
    }
    /** Wipes locally stored demo data (never touches a real database). */
    static reset() {
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem(STORAGE_KEY);
            }
            catch {
                /* ignore */
            }
        }
    }
    /** Demo identity (used by the demo auth provider). */
    get profile() {
        return this.db.profile;
    }
    get gym() {
        return this.db.gym;
    }
    now() {
        return new Date();
    }
    get tz() {
        return this.db.settings ? (this.db.gym.timezone ?? gymTimezone) : gymTimezone;
    }
    audit(actorId, entity, entityId, action, newValues, oldValues) {
        this.db.auditLogs.unshift({
            id: uid("demo-audit"),
            gymId: this.db.gym.id,
            actorId,
            entity,
            entityId,
            action,
            oldValues: oldValues ?? null,
            newValues: newValues ?? null,
            createdAt: iso(this.now()),
            actorName: this.db.profile.fullName,
        });
    }
    /* ----------------------------- settings ---------------------------- */
    async getGym() {
        return this.db.gym;
    }
    async getSettings() {
        return this.db.settings;
    }
    async updateSettings(patch) {
        this.db.settings = { ...this.db.settings, ...patch, updatedAt: iso(this.now()) };
        this.db.gym = { ...this.db.gym, name: patch.gymName, timezone: patch.timezone ?? this.db.gym.timezone };
        this.audit(this.db.profile.id, "gym_settings", this.db.settings.gymId, "update_settings", patch);
        this.persist();
        return this.db.settings;
    }
    /* ----------------------------- helpers ----------------------------- */
    membershipsOf(memberId) {
        return this.db.memberships.filter((m) => m.memberId === memberId && m.status !== "cancelled");
    }
    membershipById(id) {
        const found = this.db.memberships.find((m) => m.id === id);
        if (!found)
            throw new DataError("not_found", "Membership not found");
        return found;
    }
    planById(id) {
        const plan = this.db.plans.find((p) => p.id === id);
        if (!plan)
            throw new DataError("not_found", "Membership plan not found");
        return plan;
    }
    memberById(id) {
        const member = this.db.members.find((m) => m.id === id);
        if (!member)
            throw new DataError("not_found", "Member not found");
        return member;
    }
    withMembership(member) {
        const membership = currentMembership(this.membershipsOf(member.id));
        return {
            ...member,
            membership: membership ?? null,
            effectiveStatus: effectiveStatus(membership, member.status, this.now(), this.db.settings.expiringSoonDays, this.tz),
            planName: membership?.planName ?? null,
            endDate: membership?.endDate ?? null,
            daysRemaining: daysRemaining(membership, this.now(), this.tz),
        };
    }
    nextMemberCode() {
        const code = `DEMO-${String(this.db.counters.memberCode).padStart(4, "0")}`;
        this.db.counters.memberCode += 1;
        return code;
    }
    nextReceiptNo() {
        const year = this.now().getFullYear();
        const no = `PGS-${year}-${String(this.db.counters.receipt).padStart(6, "0")}`;
        this.db.counters.receipt += 1;
        return no;
    }
    nextMembershipId() {
        const n = this.db.memberships.length + 1;
        return `demo-membership-${String(n).padStart(4, "0")}-${Math.random().toString(36).slice(2, 6)}`;
    }
    /* ---------------------------- dashboard ---------------------------- */
    async getDashboardStats() {
        const now = this.now();
        const today = ymdInTz(now, this.tz);
        const monthKey = monthKeyInTz(now, this.tz);
        const previousMonthKey = monthKeyInTz(addMonthsClamped(now, -1), this.tz);
        const decorated = this.db.members.map((m) => this.withMembership(m));
        const activeMembers = decorated.filter((m) => m.effectiveStatus === "active" || m.effectiveStatus === "expiring_soon").length;
        const newThisMonth = decorated.filter((m) => monthKeyInTz(parseDateOnly(m.joinDate), this.tz) === monthKey).length;
        const expiredMembers = decorated.filter((m) => m.effectiveStatus === "expired").length;
        const expiringSoon = decorated.filter((m) => m.effectiveStatus === "expiring_soon").length;
        const todaysAttendance = this.db.attendance.filter((a) => ymdInTz(new Date(a.checkIn), this.tz) === today);
        const monthlyRevenue = this.db.payments
            .filter((p) => monthKeyInTz(parseDateOnly(p.paymentDate), this.tz) === monthKey && (p.status === "paid" || p.status === "partial"))
            .reduce((sum, p) => sum + p.amount, 0);
        const previousMonthRevenue = this.db.payments
            .filter((p) => monthKeyInTz(parseDateOnly(p.paymentDate), this.tz) === previousMonthKey && (p.status === "paid" || p.status === "partial"))
            .reduce((sum, p) => sum + p.amount, 0);
        const dues = await this.getDues();
        const pendingPayments = dues.filter((d) => d.balance > 0).length;
        return {
            activeMembers,
            newThisMonth,
            expiredMembers,
            expiringSoon,
            todayAttendance: todaysAttendance.length,
            currentCheckIns: this.db.settings.trackCheckout
                ? todaysAttendance.filter((a) => a.status === "checked_in").length
                : todaysAttendance.length,
            monthlyRevenue,
            previousMonthRevenue,
            pendingPayments,
            pendingAmount: dues.reduce((sum, d) => sum + d.balance, 0),
            totalMembers: this.db.members.length,
        };
    }
    async getAttendanceTrend(days) {
        const now = this.now();
        const out = [];
        for (let i = days - 1; i >= 0; i -= 1) {
            const day = addDays(now, -i);
            const key = ymdInTz(day, this.tz);
            out.push({ date: key, count: this.db.attendance.filter((a) => ymdInTz(new Date(a.checkIn), this.tz) === key).length });
        }
        return out;
    }
    async getRevenueTrend(months) {
        const now = this.now();
        const out = [];
        for (let i = months - 1; i >= 0; i -= 1) {
            const monthDate = addMonthsClamped(now, -i);
            const key = monthKeyInTz(monthDate, this.tz);
            const revenue = this.db.payments
                .filter((p) => monthKeyInTz(parseDateOnly(p.paymentDate), this.tz) === key && (p.status === "paid" || p.status === "partial"))
                .reduce((sum, p) => sum + p.amount, 0);
            out.push({ month: key, label: monthDate.toLocaleDateString("en-IN", { month: "short" }), revenue });
        }
        return out;
    }
    async getPlanDistribution() {
        return this.db.plans
            .map((plan) => {
            const activeMemberships = this.db.memberships.filter((m) => m.planId === plan.id &&
                m.status === "active" &&
                parseDateOnly(m.endDate) >= parseDateOnly(ymdInTz(this.now(), this.tz)));
            return {
                planId: plan.id,
                planName: plan.name,
                count: activeMemberships.length,
                value: activeMemberships.reduce((sum, m) => sum + m.price, 0),
            };
        })
            .sort((a, b) => b.count - a.count);
    }
    async getRecentCheckIns(limit) {
        return this.db.attendance.slice(0, limit);
    }
    async getRecentMembers(limit) {
        return this.db.members
            .map((m) => this.withMembership(m))
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .slice(0, limit);
    }
    async getUpcomingExpiries(limit) {
        const today = ymdInTz(this.now(), this.tz);
        return this.db.members
            .map((m) => this.withMembership(m))
            .filter((m) => m.membership && m.membership.endDate >= today && m.effectiveStatus !== "none")
            .sort((a, b) => ((a.membership?.endDate ?? "") < (b.membership?.endDate ?? "") ? -1 : 1))
            .slice(0, limit);
    }
    /* ------------------------------ members ---------------------------- */
    async listMembers(query = {}) {
        const search = query.search?.trim().toLowerCase() ?? "";
        let rows = this.db.members.map((m) => this.withMembership(m));
        if (search) {
            rows = rows.filter((m) => m.fullName.toLowerCase().includes(search) ||
                m.memberCode.toLowerCase().includes(search) ||
                m.phone.replace(/\s/g, "").includes(search.replace(/\s/g, "")) ||
                (m.email?.toLowerCase().includes(search) ?? false));
        }
        switch (query.status) {
            case "active":
                rows = rows.filter((m) => m.effectiveStatus === "active");
                break;
            case "expiring_soon":
                rows = rows.filter((m) => m.effectiveStatus === "expiring_soon");
                break;
            case "expired":
                rows = rows.filter((m) => m.effectiveStatus === "expired");
                break;
            case "suspended":
                rows = rows.filter((m) => m.effectiveStatus === "suspended");
                break;
            case "inactive":
                rows = rows.filter((m) => m.effectiveStatus === "inactive" || m.status === "inactive");
                break;
            default:
                break;
        }
        if (query.planId)
            rows = rows.filter((m) => m.membership?.planId === query.planId);
        const dir = query.dir === "asc" ? 1 : -1;
        const sort = query.sort ?? "created";
        rows.sort((a, b) => {
            switch (sort) {
                case "name":
                    return a.fullName.localeCompare(b.fullName) * (dir === -1 ? -1 : 1);
                case "joined":
                    return (a.joinDate < b.joinDate ? -1 : 1) * dir;
                case "expiry":
                    return ((a.membership?.endDate ?? "") < (b.membership?.endDate ?? "") ? -1 : 1) * dir;
                default:
                    return (a.createdAt < b.createdAt ? -1 : 1) * dir;
            }
        });
        const page = Math.max(1, query.page ?? 1);
        const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 10));
        const start = (page - 1) * pageSize;
        return { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
    }
    async listAllMembers() {
        return this.db.members.map((m) => this.withMembership(m));
    }
    async getMember(id) {
        const member = this.db.members.find((m) => m.id === id);
        return member ? this.withMembership(member) : null;
    }
    async createMember(input) {
        const phone = input.phone.replace(/\s/g, "");
        if (this.db.members.some((m) => m.phone.replace(/\s/g, "") === phone)) {
            throw new DataError("duplicate_phone", "A member with this phone number already exists.");
        }
        const email = input.email?.trim().toLowerCase();
        if (email && this.db.members.some((m) => m.email?.toLowerCase() === email)) {
            throw new DataError("duplicate_email", "A member with this email address already exists.");
        }
        const plan = this.planById(input.planId);
        const member = {
            id: uid("demo-member"),
            gymId: this.db.gym.id,
            memberCode: this.nextMemberCode(),
            fullName: input.fullName.trim(),
            email: email || null,
            phone: input.phone.trim(),
            photoUrl: input.photoUrl ?? null,
            dateOfBirth: input.dateOfBirth || null,
            gender: input.gender ?? null,
            address: input.address ?? null,
            emergencyContactName: input.emergencyContactName ?? null,
            emergencyContactPhone: input.emergencyContactPhone ?? null,
            joinDate: input.joinDate,
            qrToken: generateQrToken(),
            qrStatus: "active",
            qrRotatedAt: null,
            status: "active",
            notes: input.notes ?? null,
            createdBy: this.db.profile.id,
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
        };
        this.db.members.push(member);
        const membership = this.createMembershipRow(member.id, plan, input.membershipStart, { source: "new", notes: "First membership" });
        this.audit(this.db.profile.id, "members", member.id, "create_member", { memberCode: member.memberCode, plan: plan.name });
        if (input.initialPayment && input.initialPayment.amount > 0) {
            await this.createPayment({
                memberId: member.id,
                membershipId: membership.id,
                amount: input.initialPayment.amount,
                method: input.initialPayment.method,
                paymentDate: input.initialPayment.paymentDate ?? input.membershipStart,
                transactionRef: input.initialPayment.transactionRef ?? null,
                notes: input.initialPayment.notes ?? "Joining payment",
            });
        }
        this.persist();
        return this.withMembership(member);
    }
    async updateMember(id, input) {
        const member = this.memberById(id);
        if (input.phone) {
            const phone = input.phone.replace(/\s/g, "");
            const clash = this.db.members.find((m) => m.id !== id && m.phone.replace(/\s/g, "") === phone);
            if (clash)
                throw new DataError("duplicate_phone", "Another member already uses this phone number.");
        }
        const updated = {
            ...member,
            fullName: input.fullName?.trim() ?? member.fullName,
            email: input.email === undefined
                ? member.email
                : input.email?.trim()
                    ? input.email.trim().toLowerCase()
                    : null,
            phone: input.phone?.trim() ?? member.phone,
            photoUrl: input.photoUrl !== undefined ? input.photoUrl : member.photoUrl,
            dateOfBirth: input.dateOfBirth !== undefined ? input.dateOfBirth || null : member.dateOfBirth,
            gender: input.gender !== undefined ? input.gender : member.gender,
            address: input.address !== undefined ? input.address || null : member.address,
            emergencyContactName: input.emergencyContactName !== undefined ? input.emergencyContactName || null : member.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone !== undefined ? input.emergencyContactPhone || null : member.emergencyContactPhone,
            joinDate: input.joinDate ?? member.joinDate,
            notes: input.notes !== undefined ? input.notes : member.notes,
            status: input.status ?? member.status,
            updatedAt: iso(this.now()),
        };
        const index = this.db.members.findIndex((m) => m.id === id);
        this.db.members[index] = updated;
        this.audit(this.db.profile.id, "members", id, "update_member");
        this.persist();
        return this.withMembership(updated);
    }
    async deleteMember(id) {
        const member = this.memberById(id);
        this.db.members = this.db.members.filter((m) => m.id !== id);
        this.db.memberships = this.db.memberships.filter((m) => m.memberId !== id);
        this.db.attendance = this.db.attendance.filter((a) => a.memberId !== id);
        this.db.payments = this.db.payments.filter((p) => p.memberId !== id);
        this.db.enrollments = this.db.enrollments.filter((e) => e.memberId !== id);
        this.audit(this.db.profile.id, "members", id, "delete_member", { memberCode: member.memberCode, name: member.fullName });
        this.persist();
    }
    async setMemberStatus(id, status) {
        return this.updateMember(id, { status });
    }
    async getMembershipHistory(memberId) {
        return this.db.memberships
            .filter((m) => m.memberId === memberId)
            .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    }
    createMembershipRow(memberId, plan, startDate, opts) {
        const start = parseDateOnly(startDate);
        const end = computeEndDate(start, plan.durationValue, plan.durationUnit);
        const row = {
            id: this.nextMembershipId(),
            gymId: this.db.gym.id,
            memberId,
            planId: plan.id,
            startDate,
            endDate: ymd(end),
            status: "active",
            price: plan.price,
            discount: opts.discount ?? 0,
            source: opts.source ?? "new",
            notes: opts.notes ?? null,
            createdBy: this.db.profile.id,
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
            planName: plan.name,
            planDurationValue: plan.durationValue,
            planDurationUnit: plan.durationUnit,
        };
        this.db.memberships.push(row);
        return row;
    }
    async renewMembership(input) {
        const member = this.memberById(input.memberId);
        const plan = this.planById(input.planId);
        const existing = currentMembership(this.membershipsOf(member.id));
        const start = input.startDate ?? renewalStartDate(this.now(), existing, this.tz);
        const row = this.createMembershipRow(member.id, plan, start, {
            source: input.source ?? "renewal",
            discount: input.discount ?? 0,
            notes: input.notes ?? null,
        });
        this.audit(this.db.profile.id, "member_memberships", row.id, "renew_membership", {
            memberCode: member.memberCode,
            plan: plan.name,
            startDate: row.startDate,
            endDate: row.endDate,
        });
        if (input.initialPayment && input.initialPayment.amount > 0) {
            await this.createPayment({
                memberId: member.id,
                membershipId: row.id,
                amount: input.initialPayment.amount,
                method: input.initialPayment.method,
                transactionRef: input.initialPayment.transactionRef ?? null,
                notes: input.initialPayment.notes ?? "Renewal payment",
            });
        }
        this.persist();
        return row;
    }
    async setMembershipStatus(membershipId, status, notes) {
        const row = this.membershipById(membershipId);
        row.status = status;
        row.notes = notes ?? row.notes;
        row.updatedAt = iso(this.now());
        this.audit(this.db.profile.id, "member_memberships", membershipId, "set_status", { status });
        this.persist();
        return row;
    }
    async rotateQrToken(memberId) {
        const member = this.memberById(memberId);
        const previousHint = tokenHint(member.qrToken);
        const nextToken = generateQrToken();
        member.qrToken = nextToken;
        member.qrStatus = "active";
        member.qrRotatedAt = iso(this.now());
        member.updatedAt = iso(this.now());
        this.audit(this.db.profile.id, "members", memberId, "rotate_qr_token", {
            previousHint,
            newHint: tokenHint(nextToken),
        });
        this.persist();
        return member;
    }
    /* ------------------------------- plans ----------------------------- */
    async listPlans(includeInactive = true) {
        return this.db.plans
            .filter((p) => (includeInactive ? true : p.isActive))
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }
    async createPlan(input) {
        if (this.db.plans.some((p) => p.name.toLowerCase() === input.name.trim().toLowerCase())) {
            throw new DataError("duplicate_name", "A plan with this name already exists.");
        }
        const plan = {
            id: uid("demo-plan"),
            gymId: this.db.gym.id,
            name: input.name.trim(),
            description: input.description ?? null,
            price: input.price,
            durationValue: input.durationValue,
            durationUnit: input.durationUnit,
            benefits: input.benefits ?? [],
            isActive: input.isActive ?? true,
            sortOrder: this.db.plans.length,
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
        };
        this.db.plans.push(plan);
        this.audit(this.db.profile.id, "membership_plans", plan.id, "create_plan", { name: plan.name, price: plan.price });
        this.persist();
        return plan;
    }
    async updatePlan(id, input) {
        const plan = this.planById(id);
        const next = {
            ...plan,
            name: input.name?.trim() ?? plan.name,
            description: input.description !== undefined ? input.description : plan.description,
            price: input.price ?? plan.price,
            durationValue: input.durationValue ?? plan.durationValue,
            durationUnit: input.durationUnit ?? plan.durationUnit,
            benefits: input.benefits ?? plan.benefits,
            isActive: input.isActive ?? plan.isActive,
            sortOrder: input.sortOrder ?? plan.sortOrder,
            updatedAt: iso(this.now()),
        };
        const index = this.db.plans.findIndex((p) => p.id === id);
        this.db.plans[index] = next;
        this.audit(this.db.profile.id, "membership_plans", id, "update_plan", input);
        this.persist();
        return next;
    }
    async archivePlan(id, isActive) {
        return this.updatePlan(id, { isActive });
    }
    /* ---------------------------- attendance --------------------------- */
    summaryFor(member) {
        const membership = currentMembership(this.membershipsOf(member.id));
        return {
            id: member.id,
            memberCode: member.memberCode,
            fullName: member.fullName,
            photoUrl: member.photoUrl,
            planName: membership?.planName ?? null,
            membershipEnd: membership?.endDate ?? null,
            effectiveStatus: effectiveStatus(membership, member.status, this.now(), this.db.settings.expiringSoonDays, this.tz),
        };
    }
    /**
     * Synchronous (from the event loop's perspective) validation + insert so two
     * simultaneous scans can never both succeed — mirroring the DB-level
     * advisory lock + unique index used by the backend implementation.
     */
    processCheckIn(member, ctx) {
        if (member.qrStatus === "revoked") {
            return {
                status: "rejected",
                reason: "revoked_qr",
                message: "This QR code has been revoked. Ask the front desk for a new one.",
                member: this.summaryFor(member),
            };
        }
        if (member.status !== "active") {
            return {
                status: "rejected",
                reason: "member_inactive",
                message: "This member account is inactive.",
                member: this.summaryFor(member),
            };
        }
        const membership = currentMembership(this.membershipsOf(member.id));
        const eligibility = checkEligibility({
            memberStatus: member.status,
            membership,
            settings: { allowExpiredCheckin: this.db.settings.allowExpiredCheckin },
            now: this.now(),
            timeZone: this.tz,
            expiringSoonDays: this.db.settings.expiringSoonDays,
        });
        if (!eligibility.eligible) {
            const messages = {
                member_inactive: "This member account is inactive.",
                no_membership: "No active membership found. Please renew at the front desk.",
                expired: "Membership expired. Please renew before checking in.",
                suspended: "Membership is suspended. Please contact the gym owner.",
            };
            return {
                status: "rejected",
                reason: eligibility.reason,
                message: messages[eligibility.reason] ?? "Member is not eligible for check-in.",
                member: this.summaryFor(member),
            };
        }
        // Duplicate / cooldown prevention.
        const last = this.db.attendance.find((a) => a.memberId === member.id);
        const now = this.now();
        if (last) {
            const lastIn = new Date(last.checkIn).getTime();
            const cooldownMs = this.db.settings.checkinCooldownMinutes * 60_000;
            if (now.getTime() - lastIn < cooldownMs) {
                return {
                    status: "rejected",
                    reason: "cooldown",
                    message: `Already checked in at ${new Date(lastIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. Wait ${this.db.settings.checkinCooldownMinutes} minutes between check-ins.`,
                    member: this.summaryFor(member),
                };
            }
        }
        const minuteKey = Math.floor(now.getTime() / 60_000);
        const duplicateThisMinute = this.db.attendance.some((a) => a.memberId === member.id && Math.floor(new Date(a.checkIn).getTime() / 60_000) === minuteKey);
        if (duplicateThisMinute) {
            return { status: "rejected", reason: "duplicate", message: "Duplicate scan ignored.", member: this.summaryFor(member) };
        }
        const record = {
            id: uid("demo-att"),
            gymId: this.db.gym.id,
            memberId: member.id,
            membershipId: membership?.id ?? null,
            checkIn: iso(now),
            checkOut: null,
            status: "checked_in",
            method: ctx?.method ?? "qr",
            scannerId: this.db.profile.id,
            notes: ctx?.notes ?? null,
            meta: { demo: true },
            createdAt: iso(now),
            updatedAt: iso(now),
            memberName: member.fullName,
            memberCode: member.memberCode,
            memberPhoto: member.photoUrl,
            scannerName: this.db.profile.fullName,
        };
        this.db.attendance.unshift(record);
        this.persist();
        return {
            status: "ok",
            attendance: record,
            member: this.summaryFor(member),
            warning: eligibility.status === "expiring_soon" ? "Membership expiring soon" : undefined,
        };
    }
    async checkInByToken(token, ctx) {
        const member = this.db.members.find((m) => m.qrToken === token);
        if (!member) {
            return { status: "rejected", reason: "invalid_qr", message: "QR code is not recognised." };
        }
        return this.processCheckIn(member, ctx);
    }
    async checkInByMemberCode(code, ctx) {
        const needle = code.trim().toLowerCase();
        const member = this.db.members.find((m) => m.memberCode.toLowerCase() === needle || m.phone.replace(/\s/g, "") === needle.replace(/\s/g, ""));
        if (!member) {
            return { status: "rejected", reason: "not_found", message: "No member matches that ID or phone number." };
        }
        return this.processCheckIn(member, ctx);
    }
    async recordCheckout(attendanceId) {
        const record = this.db.attendance.find((a) => a.id === attendanceId);
        if (!record)
            throw new DataError("not_found", "Attendance record not found");
        record.checkOut = iso(this.now());
        record.status = "checked_out";
        record.updatedAt = record.checkOut;
        this.audit(this.db.profile.id, "attendance_records", attendanceId, "checkout");
        this.persist();
        return record;
    }
    async listAttendance(query = {}) {
        let rows = [...this.db.attendance];
        const from = query.from ? parseDateOnly(query.from).getTime() : -Infinity;
        const to = query.to ? parseDateOnly(query.to).getTime() + 86_399_999 : Infinity;
        rows = rows.filter((r) => {
            const t = new Date(r.checkIn).getTime();
            return t >= from && t <= to;
        });
        if (query.memberId)
            rows = rows.filter((r) => r.memberId === query.memberId);
        if (query.status && query.status !== "all")
            rows = rows.filter((r) => r.status === query.status);
        const page = Math.max(1, query.page ?? 1);
        const pageSize = Math.min(200, Math.max(5, query.pageSize ?? 20));
        const start = (page - 1) * pageSize;
        return { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
    }
    async listMemberAttendance(memberId, limit = 30) {
        return this.db.attendance.filter((a) => a.memberId === memberId).slice(0, limit);
    }
    async correctAttendance(id, patch) {
        const record = this.db.attendance.find((a) => a.id === id);
        if (!record)
            throw new DataError("not_found", "Attendance record not found");
        const oldValues = { checkIn: record.checkIn, checkOut: record.checkOut, notes: record.notes };
        if (patch.checkIn)
            record.checkIn = patch.checkIn;
        if (patch.checkOut !== undefined)
            record.checkOut = patch.checkOut;
        if (patch.notes !== undefined)
            record.notes = patch.notes;
        record.status = record.checkOut ? "checked_out" : "checked_in";
        record.updatedAt = iso(this.now());
        this.audit(this.db.profile.id, "attendance_records", id, "correct_attendance", patch, oldValues);
        this.persist();
        return record;
    }
    async getAttendanceSummary(range) {
        const rows = this.db.attendance.filter((a) => {
            const t = new Date(a.checkIn).getTime();
            return t >= range.from.getTime() && t <= range.to.getTime();
        });
        const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000));
        const hours = new Map();
        for (const row of rows) {
            const hour = hourInTz(new Date(row.checkIn), this.tz);
            hours.set(hour, (hours.get(hour) ?? 0) + 1);
        }
        let busiest = null;
        let best = 0;
        for (const [hour, count] of hours) {
            if (count > best) {
                best = count;
                busiest = hour;
            }
        }
        return {
            totalVisits: rows.length,
            uniqueMembers: new Set(rows.map((r) => r.memberId)).size,
            averagePerDay: Math.round((rows.length / days) * 10) / 10,
            busiestHour: busiest,
            checkIns: rows.filter((r) => r.status === "checked_in").length,
        };
    }
    async getPeakHours(range) {
        const rows = this.db.attendance.filter((a) => {
            const t = new Date(a.checkIn).getTime();
            return t >= range.from.getTime() && t <= range.to.getTime();
        });
        const buckets = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            label: `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "a" : "p"}`,
            count: 0,
        }));
        for (const row of rows) {
            const hour = hourInTz(new Date(row.checkIn), this.tz);
            const bucket = buckets[hour];
            if (bucket)
                bucket.count += 1;
        }
        return buckets;
    }
    async getMemberFrequencies(range, limit) {
        const rows = this.db.attendance.filter((a) => {
            const t = new Date(a.checkIn).getTime();
            return t >= range.from.getTime() && t <= range.to.getTime();
        });
        const counts = new Map();
        for (const row of rows) {
            const existing = counts.get(row.memberId);
            if (existing)
                existing.visits += 1;
            else
                counts.set(row.memberId, {
                    memberId: row.memberId,
                    memberCode: row.memberCode ?? "",
                    memberName: row.memberName ?? "Member",
                    visits: 1,
                });
        }
        return [...counts.values()].sort((a, b) => b.visits - a.visits).slice(0, limit);
    }
    /* ------------------------------ payments --------------------------- */
    decoratePayment(p) {
        const member = this.db.members.find((m) => m.id === p.memberId);
        const membership = p.membershipId ? this.db.memberships.find((m) => m.id === p.membershipId) : null;
        const plan = membership ? this.db.plans.find((pl) => pl.id === membership.planId) : null;
        return {
            ...p,
            memberName: member?.fullName ?? "—",
            memberCode: member?.memberCode ?? "—",
            membershipSummary: membership && plan ? `${plan.name} (${membership.startDate} → ${membership.endDate})` : null,
        };
    }
    async listPayments(query = {}) {
        let rows = [...this.db.payments].map((p) => this.decoratePayment(p));
        const search = query.search?.trim().toLowerCase() ?? "";
        if (search) {
            rows = rows.filter((p) => (p.memberName ?? "").toLowerCase().includes(search) ||
                (p.memberCode ?? "").toLowerCase().includes(search) ||
                p.receiptNo.toLowerCase().includes(search) ||
                (p.transactionRef ?? "").toLowerCase().includes(search));
        }
        if (query.from)
            rows = rows.filter((p) => p.paymentDate >= query.from);
        if (query.to)
            rows = rows.filter((p) => p.paymentDate <= query.to);
        if (query.status && query.status !== "all")
            rows = rows.filter((p) => p.status === query.status);
        if (query.method && query.method !== "all")
            rows = rows.filter((p) => p.method === query.method);
        if (query.memberId)
            rows = rows.filter((p) => p.memberId === query.memberId);
        rows.sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
        const page = Math.max(1, query.page ?? 1);
        const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 15));
        const start = (page - 1) * pageSize;
        return { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
    }
    async createPayment(input) {
        if (input.idempotencyKey) {
            if (this.idempotencyKeys.has(input.idempotencyKey)) {
                throw new DataError("duplicate_submission", "This payment was already submitted.");
            }
            this.idempotencyKeys.add(input.idempotencyKey);
        }
        const member = this.memberById(input.memberId);
        if (!(input.amount > 0))
            throw new DataError("invalid_amount", "Payment amount must be greater than zero.");
        if (input.membershipId)
            this.membershipById(input.membershipId);
        const record = {
            id: uid("demo-payment"),
            gymId: this.db.gym.id,
            memberId: member.id,
            membershipId: input.membershipId ?? null,
            amount: input.amount,
            paymentDate: input.paymentDate ?? ymd(this.now()),
            method: input.method,
            status: input.status ?? "paid",
            transactionRef: input.transactionRef ?? null,
            notes: input.notes ?? null,
            receiptNo: this.nextReceiptNo(),
            recordedBy: this.db.profile.id,
            refundOf: null,
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
        };
        this.db.payments.unshift(record);
        this.audit(this.db.profile.id, "payment_records", record.id, "create_payment", {
            memberCode: member.memberCode,
            amount: record.amount,
            method: record.method,
        });
        this.persist();
        return this.decoratePayment(record);
    }
    async refundPayment(paymentId, amount, reason) {
        const original = this.db.payments.find((p) => p.id === paymentId);
        if (!original)
            throw new DataError("not_found", "Payment not found");
        if (amount <= 0 || amount > original.amount) {
            throw new DataError("invalid_amount", "Refund must be between ₹0 and the original amount.");
        }
        const refund = {
            ...original,
            id: uid("demo-refund"),
            amount,
            status: "refunded",
            refundOf: original.id,
            notes: `Refund: ${reason}`,
            receiptNo: `${this.nextReceiptNo()}-R`,
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
        };
        this.db.payments.unshift(refund);
        this.audit(this.db.profile.id, "payment_records", refund.id, "refund_payment", { amount, reason, original: original.receiptNo });
        this.persist();
        return this.decoratePayment(refund);
    }
    async getDues() {
        const rows = [];
        for (const membership of this.db.memberships) {
            if (membership.status === "cancelled")
                continue;
            const member = this.db.members.find((m) => m.id === membership.memberId);
            if (!member)
                continue;
            const payments = this.db.payments.filter((p) => p.membershipId === membership.id && (p.status === "paid" || p.status === "partial"));
            const billed = Math.max(0, membership.price - membership.discount);
            const paid = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = membershipBalance(membership.price, membership.discount, payments);
            if (balance <= 0)
                continue;
            rows.push({
                memberId: member.id,
                memberCode: member.memberCode,
                memberName: member.fullName,
                membershipId: membership.id,
                planName: membership.planName ?? "Plan",
                endDate: membership.endDate,
                billed,
                paid,
                balance,
            });
        }
        return rows.sort((a, b) => b.balance - a.balance);
    }
    async getRevenueSummary(months) {
        const now = this.now();
        const out = [];
        for (let i = months - 1; i >= 0; i -= 1) {
            const monthDate = addMonthsClamped(now, -i);
            const key = monthKeyInTz(monthDate, this.tz);
            const collectedPayments = this.db.payments.filter((p) => monthKeyInTz(parseDateOnly(p.paymentDate), this.tz) === key && (p.status === "paid" || p.status === "partial"));
            const refunds = this.db.payments.filter((p) => monthKeyInTz(parseDateOnly(p.paymentDate), this.tz) === key && p.status === "refunded");
            const collected = collectedPayments.reduce((sum, p) => sum + p.amount, 0) - refunds.reduce((sum, p) => sum + p.amount, 0);
            const expected = this.db.memberships
                .filter((m) => monthKeyInTz(parseDateOnly(m.startDate), this.tz) === key)
                .reduce((sum, m) => sum + Math.max(0, m.price - m.discount), 0);
            out.push({
                month: key,
                label: monthDate.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
                collected: Math.max(0, collected),
                expected,
                outstanding: Math.max(0, expected - collected),
                count: collectedPayments.length,
            });
        }
        return out;
    }
    /* ------------------------- member self-service --------------------- */
    /** Demo "signed-in member": DEMO-9001 when seeded, else Aarav Sharma. */
    demoMe() {
        const member = this.db.members.find((m) => m.memberCode === "DEMO-9001") ??
            this.db.members.find((m) => m.fullName === "Aarav Sharma") ??
            this.db.members[0];
        if (!member)
            throw new DataError("not_found", "No demo member is available.");
        return member;
    }
    async getMyMemberProfile() {
        const member = this.demoMe();
        const row = this.withMembership(member);
        const current = row.membership;
        const membership = current
            ? {
                id: current.id,
                planId: current.planId,
                planName: current.planName ?? null,
                planDurationValue: current.planDurationValue ?? null,
                planDurationUnit: current.planDurationUnit ?? null,
                startDate: current.startDate,
                endDate: current.endDate,
                status: current.status,
                price: current.price,
            }
            : null;
        return {
            id: member.id,
            memberCode: member.memberCode,
            fullName: member.fullName,
            phone: member.phone || null,
            email: member.email ?? null,
            photoUrl: member.photoUrl ?? null,
            gender: member.gender ?? null,
            dateOfBirth: member.dateOfBirth ?? null,
            joinDate: member.joinDate,
            status: member.status,
            qrStatus: member.qrStatus,
            membership,
            effectiveStatus: toMyEffectiveStatus(row.effectiveStatus),
            daysRemaining: row.daysRemaining,
        };
    }
    async getMyQr() {
        const member = this.demoMe();
        return { token: member.qrToken, status: member.qrStatus };
    }
    async listMyAttendance(limit = 30) {
        return this.listMemberAttendance(this.demoMe().id, limit);
    }
    async listMyPayments() {
        const page = await this.listPayments({ memberId: this.demoMe().id, pageSize: 100 });
        return page.items;
    }
    async listMyClasses() {
        return []; // demo members never reach the portal
    }
    async changeMyPassword() {
        throw new DataError("not_supported", "Changing your password is not supported in demo mode.");
    }
    /* -------------------------------- staff ---------------------------- */
    async listStaff(includeInactive = true) {
        return this.db.staff
            .filter((s) => (includeInactive ? true : s.employmentStatus === "active"))
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    async createStaff(input) {
        const row = {
            id: uid("demo-staff"),
            gymId: this.db.gym.id,
            profileId: null,
            fullName: input.fullName.trim(),
            email: input.email?.trim() || null,
            phone: input.phone.trim(),
            role: input.role,
            specialization: input.specialization ?? null,
            employmentStatus: input.employmentStatus,
            joiningDate: input.joiningDate,
            photoUrl: input.photoUrl ?? null,
            notes: input.notes ?? null,
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
        };
        this.db.staff.push(row);
        this.audit(this.db.profile.id, "staff_profiles", row.id, "create_staff", { name: row.fullName, role: row.role });
        this.persist();
        return row;
    }
    async updateStaff(id, input) {
        const row = this.db.staff.find((s) => s.id === id);
        if (!row)
            throw new DataError("not_found", "Staff member not found");
        Object.assign(row, {
            fullName: input.fullName?.trim() ?? row.fullName,
            email: input.email !== undefined ? input.email?.trim() || null : row.email,
            phone: input.phone?.trim() ?? row.phone,
            role: input.role ?? row.role,
            specialization: input.specialization !== undefined ? input.specialization : row.specialization,
            employmentStatus: input.employmentStatus ?? row.employmentStatus,
            joiningDate: input.joiningDate ?? row.joiningDate,
            photoUrl: input.photoUrl !== undefined ? input.photoUrl : row.photoUrl,
            notes: input.notes !== undefined ? input.notes : row.notes,
            updatedAt: iso(this.now()),
        });
        this.audit(this.db.profile.id, "staff_profiles", id, "update_staff");
        this.persist();
        return row;
    }
    async archiveStaff(id) {
        return this.updateStaff(id, { employmentStatus: "resigned" });
    }
    /* ------------------------------- classes --------------------------- */
    decorateClass(cls) {
        return {
            ...cls,
            enrolledCount: this.db.enrollments.filter((e) => e.classId === cls.id && e.status !== "cancelled").length,
        };
    }
    async listClasses(from, to) {
        return this.db.classes
            .filter((c) => {
            const t = new Date(c.startsAt).getTime();
            return t >= from.getTime() && t <= to.getTime();
        })
            .map((c) => this.decorateClass(c))
            .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
    }
    async getClass(id) {
        const cls = this.db.classes.find((c) => c.id === id);
        return cls ? this.decorateClass(cls) : null;
    }
    async createClass(input) {
        const trainer = input.trainerId ? this.db.staff.find((s) => s.id === input.trainerId) : null;
        const cls = {
            id: uid("demo-class"),
            gymId: this.db.gym.id,
            name: input.name.trim(),
            description: input.description ?? null,
            trainerId: input.trainerId ?? null,
            startsAt: input.startsAt,
            durationMinutes: input.durationMinutes,
            capacity: input.capacity,
            status: "scheduled",
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
            trainerName: trainer?.fullName ?? null,
            enrolledCount: 0,
        };
        const conflict = this.db.classes.find((c) => {
            if (c.id === cls.id || c.status === "cancelled")
                return false;
            if (input.trainerId && c.trainerId !== input.trainerId)
                return false;
            const aStart = new Date(c.startsAt).getTime();
            const aEnd = aStart + c.durationMinutes * 60_000;
            const bStart = new Date(cls.startsAt).getTime();
            const bEnd = bStart + cls.durationMinutes * 60_000;
            return aStart < bEnd && bStart < aEnd;
        });
        if (conflict && input.trainerId) {
            throw new DataError("schedule_conflict", `"${conflict.name}" already occupies this trainer at that time.`);
        }
        this.db.classes.push(cls);
        this.audit(this.db.profile.id, "gym_classes", cls.id, "create_class", { name: cls.name });
        this.persist();
        return cls;
    }
    async updateClass(id, input) {
        const cls = this.db.classes.find((c) => c.id === id);
        if (!cls)
            throw new DataError("not_found", "Class not found");
        const trainer = input.trainerId ? this.db.staff.find((s) => s.id === input.trainerId) : null;
        Object.assign(cls, {
            name: input.name?.trim() ?? cls.name,
            description: input.description !== undefined ? input.description : cls.description,
            trainerId: input.trainerId !== undefined ? input.trainerId : cls.trainerId,
            trainerName: input.trainerId !== undefined ? (trainer?.fullName ?? null) : cls.trainerName,
            startsAt: input.startsAt ?? cls.startsAt,
            durationMinutes: input.durationMinutes ?? cls.durationMinutes,
            capacity: input.capacity ?? cls.capacity,
            updatedAt: iso(this.now()),
        });
        this.persist();
        return this.decorateClass(cls);
    }
    async cancelClass(id) {
        const cls = this.db.classes.find((c) => c.id === id);
        if (!cls)
            throw new DataError("not_found", "Class not found");
        cls.status = "cancelled";
        cls.updatedAt = iso(this.now());
        this.db.enrollments.forEach((e) => {
            if (e.classId === id && e.status === "enrolled")
                e.status = "cancelled";
        });
        this.audit(this.db.profile.id, "gym_classes", id, "cancel_class");
        this.persist();
        return this.decorateClass(cls);
    }
    async listEnrollments(classId) {
        return this.db.enrollments
            .filter((e) => e.classId === classId && e.status !== "cancelled")
            .map((e) => {
            const member = this.db.members.find((m) => m.id === e.memberId);
            return { ...e, memberName: member?.fullName, memberCode: member?.memberCode, memberPhoto: member?.photoUrl };
        });
    }
    async enroll(classId, memberId) {
        const cls = this.db.classes.find((c) => c.id === classId);
        if (!cls)
            throw new DataError("not_found", "Class not found");
        if (cls.status === "cancelled")
            throw new DataError("class_cancelled", "This class was cancelled.");
        const active = this.db.enrollments.filter((e) => e.classId === classId && e.status !== "cancelled");
        if (active.length >= cls.capacity)
            throw new DataError("class_full", "This class is already at full capacity.");
        if (active.some((e) => e.memberId === memberId)) {
            throw new DataError("already_enrolled", "This member is already enrolled in this class.");
        }
        const start = new Date(cls.startsAt).getTime();
        const end = start + cls.durationMinutes * 60_000;
        const memberClassIds = new Set(this.db.enrollments.filter((e) => e.memberId === memberId && e.status !== "cancelled").map((e) => e.classId));
        const conflict = this.db.classes.find((c) => {
            if (!memberClassIds.has(c.id) || c.status === "cancelled")
                return false;
            const cStart = new Date(c.startsAt).getTime();
            const cEnd = cStart + c.durationMinutes * 60_000;
            return cStart < end && start < cEnd;
        });
        if (conflict) {
            throw new DataError("schedule_conflict", `Member is already booked into "${conflict.name}" at that time.`);
        }
        const member = this.memberById(memberId);
        const row = {
            id: uid("demo-enroll"),
            gymId: this.db.gym.id,
            classId,
            memberId,
            status: "enrolled",
            enrolledAt: iso(this.now()),
            createdAt: iso(this.now()),
            updatedAt: iso(this.now()),
            memberName: member.fullName,
            memberCode: member.memberCode,
            memberPhoto: member.photoUrl,
        };
        this.db.enrollments.push(row);
        this.persist();
        return row;
    }
    async cancelEnrollment(enrollmentId) {
        const row = this.db.enrollments.find((e) => e.id === enrollmentId);
        if (!row)
            throw new DataError("not_found", "Enrollment not found");
        row.status = "cancelled";
        row.updatedAt = iso(this.now());
        this.persist();
    }
    async setEnrollmentStatus(enrollmentId, status) {
        const row = this.db.enrollments.find((e) => e.id === enrollmentId);
        if (!row)
            throw new DataError("not_found", "Enrollment not found");
        row.status = status;
        row.updatedAt = iso(this.now());
        this.persist();
        return row;
    }
    /* --------------------------- notifications ------------------------- */
    async listNotifications(filter = {}) {
        const rows = [...this.db.notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return (filter.unreadOnly ? rows.filter((n) => !n.isRead) : rows).slice(0, filter.limit ?? 100);
    }
    async getUnreadNotificationCount() {
        return this.db.notifications.filter((n) => !n.isRead).length;
    }
    async markNotificationRead(id) {
        const row = this.db.notifications.find((n) => n.id === id);
        if (row) {
            row.isRead = true;
            this.persist();
        }
    }
    async markAllNotificationsRead() {
        this.db.notifications.forEach((n) => {
            n.isRead = true;
        });
        this.persist();
    }
    async generateNotifications() {
        const now = this.now();
        const today = ymdInTz(now, this.tz);
        let created = 0;
        const push = (n) => {
            if (this.db.notifications.some((existing) => existing.dedupeKey && existing.dedupeKey === n.dedupeKey))
                return;
            this.db.notifications.unshift({
                ...n,
                id: uid("demo-notif"),
                gymId: this.db.gym.id,
                userId: this.db.profile.id,
                isRead: false,
                createdAt: iso(now),
            });
            created += 1;
        };
        for (const member of this.db.members) {
            const membership = currentMembership(this.membershipsOf(member.id));
            if (!membership)
                continue;
            const days = daysRemaining(membership, now, this.tz);
            if (days === null)
                continue;
            if (days < 0) {
                push({
                    memberId: member.id,
                    type: "membership_expired",
                    title: "Membership expired",
                    body: `${member.fullName} (${member.memberCode}) — ${membership.planName ?? "membership"} expired on ${membership.endDate}.`,
                    severity: "error",
                    dedupeKey: `expired:${membership.id}`,
                    link: `/members/${member.id}`,
                });
            }
            else if (days <= this.db.settings.expiringSoonDays) {
                push({
                    memberId: member.id,
                    type: "expiry_warning",
                    title: "Membership expiring soon",
                    body: `${member.fullName} (${member.memberCode}) — ${membership.planName ?? "membership"} ends in ${days} day${days === 1 ? "" : "s"}.`,
                    severity: "warning",
                    dedupeKey: `expiring:${membership.id}:${today}`,
                    link: `/members/${member.id}`,
                });
            }
        }
        for (const due of await this.getDues()) {
            push({
                memberId: due.memberId,
                type: "payment_pending",
                title: "Pending payment",
                body: `${due.memberName} (${due.memberCode}) owes ${due.balance} for ${due.planName}.`,
                severity: "warning",
                dedupeKey: `dues:${due.membershipId}`,
                link: "/payments",
            });
        }
        this.persist();
        return created;
    }
    async listAuditLogs(limit = 50) {
        return this.db.auditLogs.slice(0, limit);
    }
}
