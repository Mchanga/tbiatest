import { Router } from "express";

import healthRoutes from "../modules/health.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import awardsRoutes from "../modules/awards/awards.routes.js";
import businessRoutes from "../modules/businesses/businesses.routes.js";
import nominationsRoutes from "../modules/nominations/nominations.routes.js";
import userRoutes from "../modules/users/users.routes.js";
import cmsRoutes from "../modules/cms/cms.routes.js";
import notificationRoutes from "../modules/notifications/notifications.routes.js";
import reportRoutes from "../modules/reports/reports.routes.js";
import eventRoutes from "../modules/events/events.routes.js";
import judgingRoutes from "../modules/judging/judging.routes.js";
import votingRoutes from "../modules/voting/voting.routes.js";
import winnerRoutes from "../modules/winners/winners.routes.js";
import sponsorshipRoutes from "../modules/sponsorship/sponsorship.routes.js";
import paymentRoutes from "../modules/payments/payments.routes.js";
import documentRoutes from "../modules/documents/documents.routes.js";
import accessRoutes from "../modules/access/access.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

router.use("/users", userRoutes);

router.use("/businesses", businessRoutes);

router.use("/awards", awardsRoutes);

router.use("/nominations", nominationsRoutes);
router.use("/cms", cmsRoutes);
router.use("/notifications", notificationRoutes);
router.use("/reports", reportRoutes);
router.use("/events", eventRoutes);
router.use("/judging", judgingRoutes);
router.use("/voting", votingRoutes);
router.use("/winners", winnerRoutes);
router.use("/sponsorship", sponsorshipRoutes);
router.use("/payments", paymentRoutes);
router.use("/documents", documentRoutes);
router.use("/access", accessRoutes);

export default router;
