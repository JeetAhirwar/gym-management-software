import { computeEndDate } from "@/lib/membership";
import { generateQrToken } from "@/lib/qr";
import { addDays, addMonthsClamped, startOfDayInTz } from "@/lib/datetime";
/* ------------------------------ helpers ------------------------------ */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function iso(date) {
    return date.toISOString();
}
function dateOnly(date) {
    return date.toISOString().slice(0, 10);
}
const PHOTOS = [
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=240&h=240&q=70&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1463453091185-61582044d556?w=240&h=240&q=70&auto=format&fit=crop",
];
const NAMES = [
    ["Aarav Sharma", "male"],
    ["Diya Patel", "female"],
    ["Rohan Mehta", "male"],
    ["Ananya Iyer", "female"],
    ["Kabir Singh", "male"],
    ["Meera Nair", "female"],
    ["Vivaan Reddy", "male"],
    ["Ishita Kapoor", "female"],
    ["Aditya Joshi", "male"],
    ["Saanvi Rao", "female"],
    ["Arjun Malhotra", "male"],
    ["Kavya Menon", "female"],
    ["Devansh Gupta", "male"],
    ["Nisha Verma", "female"],
    ["Rahul Chawla", "male"],
    ["Priya Deshmukh", "female"],
    ["Karan Bhatia", "male"],
    ["Tanvi Kulkarni", "female"],
    ["Manav Trivedi", "male"],
    ["Riya Sinha", "female"],
    ["Yash Thakur", "male"],
    ["Aditi Bose", "female"],
    ["Siddharth Pillai", "male"],
    ["Pooja Ramesh", "female"],
    ["Nikhil Arora", "male"],
    ["Shreya Dutta", "female"],
];
const MEMBER_SEED = NAMES.map(([name, gender], index) => {
    const planIndex = index % 4;
    let state = "active";
    if (index >= 18 && index < 22)
        state = "expired";
    else if (index >= 22 && index < 24)
        state = "suspended";
    else if (index >= 24)
        state = "none";
    else if (index % 7 === 3)
        state = "expiring";
    else if (index % 11 === 5)
        state = "inactive";
    return {
        name,
        gender,
        phone: `+91 98${(76543210 + index * 137).toString().slice(0, 8)}`,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        photo: PHOTOS[index % PHOTOS.length],
        planIndex,
        state,
        joinedDaysAgo: 20 + index * 11,
        visitsPerMonth: 6 + (index % 5) * 3,
    };
});
const STAFF_SEED = [
    {
        profileId: null,
        fullName: "Ritika Anand",
        email: "ritika@pulsefit.example",
        phone: "+91 9900112233",
        role: "admin",
        specialization: "Operations & billing",
        employmentStatus: "active",
        joiningDate: dateOnly(addDays(new Date(), -420)),
        photoUrl: PHOTOS[1],
        notes: "Handles membership renewals and dues follow-ups. [DEMO SEED]",
    },
    {
        profileId: null,
        fullName: "Vikram Sethi",
        email: "vikram@pulsefit.example",
        phone: "+91 9811223344",
        role: "front_desk",
        specialization: "Front desk & check-ins",
        employmentStatus: "active",
        joiningDate: dateOnly(addDays(new Date(), -260)),
        photoUrl: PHOTOS[2],
        notes: "Runs the QR scanner desk during peak hours. [DEMO SEED]",
    },
    {
        profileId: null,
        fullName: "Coach Daniel Fernandes",
        email: "daniel@pulsefit.example",
        phone: "+91 9745667788",
        role: "trainer",
        specialization: "Strength & conditioning",
        employmentStatus: "active",
        joiningDate: dateOnly(addDays(new Date(), -380)),
        photoUrl: PHOTOS[5],
        notes: "NSCA-CPT. Leads Power Hour and Barbell Basics. [DEMO SEED]",
    },
    {
        profileId: null,
        fullName: "Coach Sneha Kulkarni",
        email: "sneha@pulsefit.example",
        phone: "+91 9632445566",
        role: "trainer",
        specialization: "Y mobility, HIIT",
        employmentStatus: "active",
        joiningDate: dateOnly(addDays(new Date(), -190)),
        photoUrl: PHOTOS[6],
        notes: "Evening batch specialist. [DEMO SEED]",
    },
    {
        profileId: null,
        fullName: "Aman Qureshi",
        email: "aman@pulsefit.example",
        phone: "+91 9587990011",
        role: "trainer",
        specialization: "Nutrition coaching",
        employmentStatus: "on_leave",
        joiningDate: dateOnly(addDays(new Date(), -95)),
        photoUrl: PHOTOS[8],
        notes: "On leave until further notice. [DEMO SEED]",
    },
];
/* ------------------------------ builder ------------------------------ */
export function buildDemoDatabase(now = new Date()) {
    const rnd = mulberry32(20260113);
    const gym = {
        id: "demo-gym-0001",
        name: "Pulse Fitness Studio — Demo",
        slug: "pulse-demo-gym",
        timezone: "Asia/Kolkata",
        currency: "INR",
        logoUrl: null,
        address: "14 Residency Road, Bengaluru 560025",
        phone: "+91 80 4123 8899",
        email: "hello@pulsefit.example",
        isActive: true,
        createdAt: iso(addDays(now, -540)),
        updatedAt: iso(now),
    };
    const settings = {
        gymId: gym.id,
        checkinCooldownMinutes: 60,
        trackCheckout: true,
        expiringSoonDays: 7,
        expiryReminderDays: [7, 3, 1],
        allowExpiredCheckin: false,
        enableEmail: false,
        enableSms: false,
        enableWhatsapp: false,
        enablePush: false,
        attendanceRetentionDays: 365,
        updatedAt: iso(now),
    };
    const profile = {
        id: "demo-user-0001",
        gymId: gym.id,
        fullName: "Ritika Anand",
        email: "admin@pulsefit.demo",
        phone: "+91 9900112233",
        role: "owner",
        avatarUrl: PHOTOS[1],
        isActive: true,
        lastLoginAt: null,
        createdAt: iso(addDays(now, -420)),
        updatedAt: iso(now),
    };
    const planDefs = [
        {
            name: "Monthly",
            description: "Flexible month-to-month access with no lock-in.",
            price: 1500,
            durationValue: 1,
            durationUnit: "month",
            benefits: ["Full floor access", "Locker included", "1 body composition scan"],
        },
        {
            name: "Quarterly",
            description: "Three months of training with two group classes a week.",
            price: 4000,
            durationValue: 3,
            durationUnit: "month",
            benefits: ["Full floor access", "2 group classes / week", "Locker included", "2 body composition scans"],
        },
        {
            name: "Half-Yearly",
            description: "Six months of unlimited training plus a nutrition consult.",
            price: 7000,
            durationValue: 6,
            durationUnit: "month",
            benefits: ["Unlimited group classes", "1 nutrition consult", "Guest pass × 2", "Locker included"],
        },
        {
            name: "Annual",
            description: "Best value — twelve months, priority class booking.",
            price: 12000,
            durationValue: 12,
            durationUnit: "month",
            benefits: [
                "Unlimited group classes",
                "Priority class booking",
                "Quarterly assessments",
                "Guest pass × 4",
                "Merchandise kit",
            ],
        },
    ];
    const plans = planDefs.map((def, i) => ({
        id: `demo-plan-000${i + 1}`,
        gymId: gym.id,
        ...def,
        isActive: true,
        sortOrder: i,
        createdAt: iso(addDays(now, -500)),
        updatedAt: iso(now),
    }));
    const members = [];
    const memberships = [];
    const attendance = [];
    const payments = [];
    let receiptCounter = 1;
    const attendanceHours = [6, 7, 8, 9, 17, 18, 19, 20, 21];
    MEMBER_SEED.forEach((seed, index) => {
        const id = `demo-member-${String(index + 1).padStart(4, "0")}`;
        const memberCode = `DEMO-${String(101 + index).padStart(4, "0")}`;
        const joinDate = dateOnly(addDays(now, -seed.joinedDaysAgo));
        const member = {
            id,
            gymId: gym.id,
            memberCode,
            fullName: seed.name,
            email: seed.email,
            phone: seed.phone,
            photoUrl: seed.photo,
            dateOfBirth: seed.joinedDaysAgo > 3000 ? null : dateOnly(addDays(now, -(22 + index) * 365)),
            gender: seed.gender,
            address: index % 3 === 0 ? "Indiranagar, Bengaluru" : index % 3 === 1 ? "Koramangala, Bengaluru" : null,
            emergencyContactName: index % 2 === 0 ? `${seed.name.split(" ")[0]} (spouse)` : null,
            emergencyContactPhone: index % 2 === 0 ? `+91 90${(11223344 + index).toString().slice(0, 8)}` : null,
            joinDate,
            qrToken: `demo_qr_token_${String(index + 1).padStart(2, "0")}${"0".repeat(24)}`,
            qrStatus: "active",
            qrRotatedAt: null,
            status: seed.state === "inactive" ? "inactive" : "active",
            notes: "[DEMO SEED] Seeded sample member.",
            createdBy: profile.id,
            createdAt: iso(addDays(now, -seed.joinedDaysAgo)),
            updatedAt: iso(now),
        };
        members.push(member);
        if (seed.state === "none")
            return;
        const plan = plans[seed.planIndex];
        let start = addDays(now, -seed.joinedDaysAgo);
        if (seed.state === "expired")
            start = addDays(now, -(45 + index));
        if (seed.state === "expiring")
            start = addDays(now, -(plan.durationValue * 30 - 4));
        // Clamp plan duration using real calendar math.
        const end = computeEndDate(start, plan.durationValue, plan.durationUnit);
        const membership = {
            id: `demo-membership-${String(index + 1).padStart(4, "0")}`,
            gymId: gym.id,
            memberId: id,
            planId: plan.id,
            startDate: dateOnly(start),
            endDate: dateOnly(end),
            status: seed.state === "suspended" ? "suspended" : "active",
            price: plan.price,
            discount: seed.state === "expiring" && index % 2 === 0 ? 200 : 0,
            source: index % 4 === 0 ? "renewal" : "new",
            notes: "[DEMO SEED] Initial membership.",
            createdBy: profile.id,
            createdAt: iso(start),
            updatedAt: iso(now),
            planName: plan.name,
            planDurationValue: plan.durationValue,
            planDurationUnit: plan.durationUnit,
        };
        memberships.push(membership);
        // Payments: most members paid fully, a few partial/pending.
        const paidRatio = seed.state === "expired" ? 1 : index % 9 === 4 ? 0.4 : index % 7 === 2 ? 0 : 1;
        if (paidRatio > 0) {
            const amount = Math.round(plan.price * paidRatio);
            payments.push({
                id: `demo-payment-${String(receiptCounter).padStart(4, "0")}`,
                gymId: gym.id,
                memberId: id,
                membershipId: membership.id,
                amount,
                paymentDate: dateOnly(start),
                method: ["cash", "upi", "card", "bank_transfer"][index % 4],
                status: paidRatio === 1 ? "paid" : "partial",
                transactionRef: index % 3 === 0 ? `UPI${100000 + index * 31}` : null,
                notes: "[DEMO SEED] Membership fee received.",
                receiptNo: `PGS-${now.getFullYear()}-${String(receiptCounter).padStart(6, "0")}`,
                recordedBy: profile.id,
                refundOf: null,
                createdAt: iso(start),
                updatedAt: iso(start),
            });
            receiptCounter += 1;
        }
        // Attendance: last 30 days, weighted toward morning/evening peaks.
        if (seed.state === "active" || seed.state === "expiring" || seed.state === "suspended") {
            for (let dayOffset = 30; dayOffset >= 0; dayOffset -= 1) {
                const day = addDays(now, -dayOffset);
                const visitsToday = rnd() < seed.visitsPerMonth / 30 ? 1 : 0;
                if (!visitsToday)
                    continue;
                const hour = attendanceHours[Math.floor(rnd() * attendanceHours.length)];
                const checkIn = new Date(startOfDayInTz(day).getTime() + hour * 3600_000 + Math.floor(rnd() * 2400_000));
                if (checkIn > now)
                    continue;
                const checkOut = rnd() > 0.35 ? new Date(checkIn.getTime() + (55 + Math.floor(rnd() * 45)) * 60_000) : null;
                if (checkOut && checkOut > now)
                    continue;
                attendance.push({
                    id: `demo-att-${String(attendance.length + 1).padStart(5, "0")}`,
                    gymId: gym.id,
                    memberId: id,
                    membershipId: membership.id,
                    checkIn: iso(checkIn),
                    checkOut: checkOut ? iso(checkOut) : null,
                    status: checkOut ? "checked_out" : "checked_in",
                    method: index % 6 === 5 ? "manual" : "qr",
                    scannerId: profile.id,
                    notes: null,
                    meta: { demo: true },
                    createdAt: iso(checkIn),
                    updatedAt: iso(checkOut ?? checkIn),
                    memberName: seed.name,
                    memberCode,
                    memberPhoto: seed.photo,
                    scannerName: "Ritika Anand",
                });
            }
        }
    });
    /* Staff */
    const staff = STAFF_SEED.map((s, i) => ({
        ...s,
        id: `demo-staff-${String(i + 1).padStart(4, "0")}`,
        gymId: gym.id,
        createdAt: s.joiningDate,
        updatedAt: iso(now),
    }));
    /* Classes: past week + next two weeks */
    const classes = [];
    const enrollments = [];
    const classTemplates = [
        ["Power Hour", "Barbell strength circuit", 2, 60, 18],
        ["Sunrise Yoga", "Mobility, breath and balance", 3, 45, 20],
        ["HIIT 45", "High-intensity intervals", 3, 45, 16],
        ["Spin Circuit", "Indoor cycling intervals", 1, 50, 14],
        ["Core & More", "Core conditioning finisher", 2, 30, 22],
    ];
    let classIndex = 0;
    for (let offset = -6; offset <= 14; offset += 1) {
        const day = addDays(now, offset);
        const templatesToRun = offset < 0 ? [classTemplates[0], classTemplates[2]] : classTemplates;
        templatesToRun.forEach((tpl, tplIndex) => {
            if ((offset + tplIndex) % 2 === 0)
                return;
            const hour = 6 + ((classIndex + tplIndex) % 3) * 6; // 6:00, 12:00, 18:00
            const startsAt = new Date(startOfDayInTz(day).getTime() + hour * 3600_000);
            if (offset === 0 && startsAt < now)
                return;
            const id = `demo-class-${String(classIndex + 1).padStart(4, "0")}`;
            const trainer = staff.filter((s) => s.role === "trainer")[classIndex % 3];
            const capacity = tpl[4];
            classes.push({
                id,
                gymId: gym.id,
                name: tpl[0],
                description: `${tpl[1]} — [DEMO SEED]`,
                trainerId: trainer?.id ?? null,
                startsAt: iso(startsAt),
                durationMinutes: tpl[3],
                capacity,
                status: offset < 0 ? "completed" : "scheduled",
                createdAt: iso(addDays(now, -20)),
                updatedAt: iso(now),
                trainerName: trainer?.fullName ?? null,
                enrolledCount: 0,
            });
            const enrolledTarget = Math.min(capacity - (classIndex % 4 === 0 ? 0 : 2), 4 + (classIndex % 6));
            for (let e = 0; e < enrolledTarget; e += 1) {
                const memberIndex = (classIndex * 3 + e * 5) % members.length;
                const member = members[memberIndex];
                if (!member)
                    continue;
                enrollments.push({
                    id: `demo-enroll-${String(enrollments.length + 1).padStart(4, "0")}`,
                    gymId: gym.id,
                    classId: id,
                    memberId: member.id,
                    status: offset < 0 ? (e % 3 === 0 ? "attended" : "enrolled") : "enrolled",
                    enrolledAt: iso(addDays(now, -3)),
                    createdAt: iso(addDays(now, -3)),
                    updatedAt: iso(now),
                    memberName: member.fullName,
                    memberCode: member.memberCode,
                    memberPhoto: member.photoUrl,
                });
            }
            classIndex += 1;
        });
    }
    for (const cls of classes) {
        cls.enrolledCount = enrollments.filter((e) => e.classId === cls.id && e.status !== "cancelled").length;
    }
    /* Notifications */
    const notifications = [
        {
            id: "demo-notif-0001",
            gymId: gym.id,
            userId: profile.id,
            memberId: null,
            type: "general",
            title: "Demo dataset loaded",
            body: "You are exploring Pulse Gym Suite with seeded sample data. Connect your backend to go live.",
            severity: "info",
            isRead: false,
            dedupeKey: "demo-welcome",
            link: "/settings",
            createdAt: iso(addMinutes(now, -12)),
        },
        {
            id: "demo-notif-0002",
            gymId: gym.id,
            userId: profile.id,
            memberId: members.find((m) => m.memberCode === "DEMO-0105")?.id ?? null,
            type: "expiry_warning",
            title: "Membership expiring soon",
            body: "DEMO-0105 has a membership that ends within the reminder window.",
            severity: "warning",
            isRead: false,
            dedupeKey: "demo-expiry-105",
            link: "/members",
            createdAt: iso(addMinutes(now, -90)),
        },
        {
            id: "demo-notif-0003",
            gymId: gym.id,
            userId: profile.id,
            memberId: null,
            type: "payment_pending",
            title: "Pending dues follow-up",
            body: "Two demo members still carry an outstanding balance for their current membership.",
            severity: "warning",
            isRead: true,
            dedupeKey: "demo-dues",
            link: "/payments",
            createdAt: iso(addMinutes(now, -26 * 60)),
        },
    ];
    const auditLogs = [
        {
            id: "demo-audit-0001",
            gymId: gym.id,
            actorId: profile.id,
            entity: "system",
            entityId: null,
            action: "demo_seed_loaded",
            oldValues: null,
            newValues: { members: members.length, attendance: attendance.length, payments: payments.length },
            createdAt: iso(now),
            actorName: profile.fullName,
        },
    ];
    return {
        gym,
        settings,
        profile,
        plans,
        members,
        memberships,
        attendance: attendance.sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)),
        payments: payments.sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1)),
        staff,
        classes: classes.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1)),
        enrollments,
        notifications,
        auditLogs,
        counters: { memberCode: 101 + members.length, receipt: receiptCounter, attendance: attendance.length + 1 },
    };
}
function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60_000);
}
export { addMonthsClamped, generateQrToken };
