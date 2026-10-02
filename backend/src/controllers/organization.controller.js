const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { handleControllerError } = require('../utils/controllerError');

/**
 * Create a new Organization
 * @route POST /api/organizations
 * @access Private (Admin)
 */
exports.createOrganization = async (req, res) => {
    try {
        const { name, type, creditLimit, markup, allowedCarriers, address, taxId } = req.body;

        const organization = await prisma.organization.create({
            data: {
                name,
                type,
                creditLimit: Number(creditLimit) || 0,
                taxId,
                markup: markup || {},
                allowedCarriers: allowedCarriers || {},
                addresses: address ? [address] : []
            }
        });

        res.status(201).json({
            success: true,
            data: organization
        });
    } catch (error) {
        return handleControllerError(res, error, 'Organization creation');
    }
};

/**
 * Get all Organizations
 * @route GET /api/organizations
 * @access Private (Admin/Staff)
 */
exports.getAllOrganizations = async (req, res) => {
    try {
        const user = req.user;
        const isOps = ['admin', 'manager', 'staff', 'accounting'].includes(user?.role);

        // If not staff/admin, only return the user's assigned organization (or empty array)
        if (!isOps) {
            if (user?.organizationId) {
                const org = await prisma.organization.findUnique({
                    where: { id: user.organizationId },
                    include: {
                        members: {
                            select: { id: true, name: true, email: true, role: true }
                        }
                    }
                });
                return res.status(200).json({
                    success: true,
                    count: org ? 1 : 0,
                    data: org ? [org] : []
                });
            }
            return res.status(200).json({
                success: true,
                count: 0,
                data: []
            });
        }

        const organizations = await prisma.organization.findMany({
            include: {
                members: {
                    select: { id: true, name: true, email: true, role: true }
                }
            },
            orderBy: { name: 'asc' }
        });

        res.status(200).json({
            success: true,
            count: organizations.length,
            data: organizations
        });
    } catch (error) {
        logger.error('Error fetching organizations:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

/**
 * Get single Organization
 * @route GET /api/organizations/:id
 * @access Private
 */
exports.getOrganization = async (req, res) => {
    try {
        const isPlatformStaff = ['admin', 'staff', 'manager', 'accounting'].includes(req.user.role);
        if (!isPlatformStaff && req.user.organizationId !== req.params.id) {
            return res.status(403).json({ success: false, error: 'Permission denied: Cannot view another organization' });
        }

        const organization = await prisma.organization.findUnique({
            where: { id: req.params.id },
            include: {
                members: {
                    select: { id: true, name: true, email: true, role: true }
                }
            }
        });

        if (!organization) {
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        res.status(200).json({
            success: true,
            data: organization
        });
    } catch (error) {
        logger.error('Error fetching organization:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
};

/**
 * Update Organization
 * @route PATCH /api/organizations/:id
 * @access Private (Admin)
 */
exports.updateOrganization = async (req, res) => {
    try {
        const updateData = { ...req.body };
        delete updateData.balance; // Protect balance from manual update
        delete updateData.id;

        // Convert numeric fields
        if (updateData.creditLimit !== undefined) updateData.creditLimit = Number(updateData.creditLimit);

        const organization = await prisma.organization.update({
            where: { id: req.params.id },
            data: updateData
        });

        res.status(200).json({
            success: true,
            data: organization
        });
    } catch (error) {
        return handleControllerError(res, error, 'Organization update');
    }
};

/**
 * Add Member to Organization
 * @route POST /api/organizations/:id/members
 * @access Private (Admin)
 */
exports.addMember = async (req, res) => {
    try {
        const { userId } = req.body;
        const orgId = req.params.id;

        const organization = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!organization) return res.status(404).json({ success: false, error: 'Org not found' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        if (user.organizationId && user.organizationId !== orgId) {
            return res.status(400).json({ success: false, error: 'User already in another organization' });
        }

        // Link User to Org via Prisma
        await prisma.user.update({
            where: { id: userId },
            data: { organizationId: orgId }
        });

        res.status(200).json({
            success: true,
            message: 'Member added successfully'
        });
    } catch (error) {
        return handleControllerError(res, error, 'Member addition');
    }
};

/**
 * Remove Member from Organization
 * @route DELETE /api/organizations/:id/members/:userId
 * @access Private (Admin)
 */
exports.removeMember = async (req, res) => {
    try {
        const { userId } = req.params;

        // Simply unlink by setting organizationId to null
        await prisma.user.update({
            where: { id: userId },
            data: { organizationId: null }
        });

        res.status(200).json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        logger.error('Error removing member:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * Delete Organization & Cascade Financials (Admin Only)
 * @route DELETE /api/organizations/:id
 * @access Private (Admin)
 */
exports.deleteOrganization = async (req, res) => {
    try {
        const orgId = req.params.id;

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Only administrators can delete an organization and purge its financials'
            });
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: {
                _count: {
                    select: {
                        members: true,
                        invoices: true,
                        payments: true,
                        ledgerEntries: true,
                        shipments: true
                    }
                }
            }
        });

        if (!org) {
            return res.status(404).json({ success: false, error: 'Organization not found' });
        }

        logger.info(`Admin ${req.user.id} initiated complete deletion of organization ${orgId} (${org.name}) with records:`, org._count);

        await prisma.$transaction(async (tx) => {
            // 1. Delete webhook events and subscriptions
            await tx.webhookEvent.deleteMany({
                where: { subscription: { organizationId: orgId } }
            });
            await tx.webhookSubscription.deleteMany({
                where: { organizationId: orgId }
            });

            // 2. Delete user access scopes tied to this organization
            await tx.userAccessScope.deleteMany({
                where: { organizationId: orgId }
            });

            // 3. Delete invoice delivery logs
            await tx.invoiceDeliveryLog.deleteMany({
                where: {
                    OR: [
                        { organizationId: orgId },
                        { invoice: { organizationId: orgId } }
                    ]
                }
            });

            // 4. Delete payment allocations for this organization or its payments
            await tx.paymentAllocation.deleteMany({
                where: {
                    OR: [
                        { organizationId: orgId },
                        { payment: { organizationId: orgId } }
                    ]
                }
            });

            // 5. Delete invoice lines belonging to this organization's invoices
            await tx.invoiceLine.deleteMany({
                where: { invoice: { organizationId: orgId } }
            });

            // 6. Delete invoices for this organization
            await tx.invoice.deleteMany({
                where: { organizationId: orgId }
            });

            // 7. Delete payments for this organization
            await tx.payment.deleteMany({
                where: { organizationId: orgId }
            });

            // 8. Delete organization ledger entries
            await tx.organizationLedger.deleteMany({
                where: { organizationId: orgId }
            });

            // 9. Unlink organization from General Ledger lines (preserves journal balance)
            await tx.journalEntryLine.updateMany({
                where: { organizationId: orgId },
                data: { organizationId: null }
            });

            // 10. Unlink organization from pickup requests
            await tx.pickupRequest.updateMany({
                where: { organizationId: orgId },
                data: { organizationId: null }
            });

            // 11. Unlink organization from shipments
            await tx.shipment.updateMany({
                where: { organizationId: orgId },
                data: { organizationId: null }
            });

            // 12. Unlink members from this organization
            await tx.user.updateMany({
                where: { organizationId: orgId },
                data: { organizationId: null }
            });

            // 13. Delete the organization
            await tx.organization.delete({
                where: { id: orgId }
            });
        });

        logger.info(`Organization ${orgId} (${org.name}) and its financials deleted successfully by admin ${req.user.id}`);

        res.status(200).json({
            success: true,
            message: `Organization ${org.name} and all its financials were successfully deleted`
        });
    } catch (error) {
        logger.error('Error deleting organization:', error);
        return handleControllerError(res, error, 'Organization deletion');
    }
};
