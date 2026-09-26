require('dotenv').config();

const { prisma } = require('./src/config/database');
const { hashPassword } = require('./src/utils/security');
const { seedAccounting } = require('./src/scripts/seedAccounting');
const fs = require('fs');
const path = require('path');

async function seedShowcaseDemo() {
  console.log('====================================================');
  console.log('🚀 SEEDING SHOWCASE DEMO ENVIRONMENT (CLIENT READY)');
  console.log('====================================================');

  await prisma.$connect();

  const commonPassword = await hashPassword('password123');

  // ── 1. Seed Organizations ──────────────────────────────────────────
  console.log('\n📦 Seeding Organizations...');

  const orgTarget = await prisma.organization.upsert({
    where: { name: 'Target Logistics' },
    update: {
      type: 'internal',
      currency: 'KWD',
      creditLimit: 100000,
      active: true,
      billingContactName: 'Operations Command',
      billingEmail: 'ops@targetlogistics.kw',
      billingWhatsappNumber: '+96590001000'
    },
    create: {
      name: 'Target Logistics',
      type: 'internal',
      currency: 'KWD',
      creditLimit: 100000,
      active: true,
      billingContactName: 'Operations Command',
      billingEmail: 'ops@targetlogistics.kw',
      billingWhatsappNumber: '+96590001000'
    }
  });

  const orgGulfApex = await prisma.organization.upsert({
    where: { name: 'Gulf Apex Trading W.L.L.' },
    update: {
      type: 'BUSINESS',
      currency: 'KWD',
      taxId: 'KW-APX-998822',
      creditLimit: 15000,
      balance: 1450.500,
      active: true,
      billingContactName: 'Yousef Al-Mutawa',
      billingEmail: 'accounts@gulfapex.com',
      billingWhatsappNumber: '+96599112233',
      markup: { type: 'PERCENTAGE', percentageValue: 12, flatValue: 0 }
    },
    create: {
      name: 'Gulf Apex Trading W.L.L.',
      type: 'BUSINESS',
      currency: 'KWD',
      taxId: 'KW-APX-998822',
      creditLimit: 15000,
      balance: 1450.500,
      active: true,
      billingContactName: 'Yousef Al-Mutawa',
      billingEmail: 'accounts@gulfapex.com',
      billingWhatsappNumber: '+96599112233',
      markup: { type: 'PERCENTAGE', percentageValue: 12, flatValue: 0 }
    }
  });

  const orgAlSabah = await prisma.organization.upsert({
    where: { name: 'Al-Sabah Medical & Pharma Logistics' },
    update: {
      type: 'BUSINESS',
      currency: 'KWD',
      taxId: 'KW-MED-441122',
      creditLimit: 25000,
      balance: 3200.000,
      active: true,
      billingContactName: 'Dr. Fatima Al-Sabah',
      billingEmail: 'logistics@alsabahmed.kw',
      billingWhatsappNumber: '+96599554433',
      markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 1.5 }
    },
    create: {
      name: 'Al-Sabah Medical & Pharma Logistics',
      type: 'BUSINESS',
      currency: 'KWD',
      taxId: 'KW-MED-441122',
      creditLimit: 25000,
      balance: 3200.000,
      active: true,
      billingContactName: 'Dr. Fatima Al-Sabah',
      billingEmail: 'logistics@alsabahmed.kw',
      billingWhatsappNumber: '+96599554433',
      markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 1.5 }
    }
  });

  const orgGov = await prisma.organization.upsert({
    where: { name: 'Kuwait Ministry of Commerce' },
    update: {
      type: 'GOVERNMENT',
      currency: 'KWD',
      taxId: 'GOV-MOC-001',
      creditLimit: 50000,
      balance: 0,
      active: true,
      billingContactName: 'Procurement Dept',
      billingEmail: 'procurement@moci.gov.kw',
      billingWhatsappNumber: '+96522480000'
    },
    create: {
      name: 'Kuwait Ministry of Commerce',
      type: 'GOVERNMENT',
      currency: 'KWD',
      taxId: 'GOV-MOC-001',
      creditLimit: 50000,
      balance: 0,
      active: true,
      billingContactName: 'Procurement Dept',
      billingEmail: 'procurement@moci.gov.kw',
      billingWhatsappNumber: '+96522480000'
    }
  });

  console.log(`✓ 4 Organizations verified/seeded.`);

  // ── 2. Seed All 8 Platform Role Users ──────────────────────────────
  console.log('\n👥 Seeding 8 Platform Role Accounts (password: password123)...');

  const demoAddresses = [
    {
      id: 'addr-demo-01',
      label: 'Kuwait City HQ Hub',
      company: 'Target Logistics Center',
      contactPerson: 'Tariq Al-Bader',
      phone: '+965 9000 1000',
      email: 'ops@targetlogistics.kw',
      countryCode: 'KW',
      city: 'Kuwait City',
      streetLines: ['Al-Sour Street, Commercial Area 9, Floor 14'],
      postalCode: '13001'
    },
    {
      id: 'addr-demo-02',
      label: 'Shuwaikh Industrial Logistics Base',
      company: 'Gulf Apex Trading W.L.L.',
      contactPerson: 'Yousef Al-Mutawa',
      phone: '+965 9911 2233',
      email: 'warehouse@gulfapex.com',
      countryCode: 'KW',
      city: 'Shuwaikh',
      streetLines: ['Street 28, Block 1, Warehouse 44B'],
      postalCode: '70051'
    },
    {
      id: 'addr-demo-03',
      label: 'Riyadh Distribution Center',
      company: 'Apex Saudi Logistics',
      contactPerson: 'Fahad Al-Dossary',
      phone: '+966 50 123 4567',
      email: 'riyadh@apexlogistics.sa',
      countryCode: 'SA',
      city: 'Riyadh',
      streetLines: ['King Fahd Road, Al-Olaya District, Unit 12'],
      postalCode: '12214'
    },
    {
      id: 'addr-demo-04',
      label: 'Dubai South DWC Freezone',
      company: 'Gulf Apex Cargo UAE',
      contactPerson: 'Rashid Al-Maktoum',
      phone: '+971 50 987 6543',
      email: 'dubai@apexlogistics.ae',
      countryCode: 'AE',
      city: 'Dubai',
      streetLines: ['Dubai Logistics City, Building B3, Suite 201'],
      postalCode: '00000'
    },
    {
      id: 'addr-demo-05',
      label: 'London Mayfair Client Suite',
      company: 'Harrods Premium Services',
      contactPerson: 'James Thornton',
      phone: '+44 20 7946 0912',
      email: 'concierge@harrods-logistics.co.uk',
      countryCode: 'GB',
      city: 'London',
      streetLines: ['87 Brompton Road, Knightsbridge'],
      postalCode: 'SW1X 7XL'
    }
  ];

  const rolesToSeed = [
    {
      email: 'admin@demo.com',
      name: 'System Superadmin',
      role: 'admin',
      phone: '+965 9000 0001',
      organizationId: orgTarget.id,
      creditLimit: 100000,
      carrierConfig: { preferredCarrier: 'DHL', traderType: 'business' }
    },
    {
      email: 'manager@demo.com',
      name: 'Nasser Al-Ghanim',
      role: 'manager',
      phone: '+965 9000 0002',
      organizationId: orgTarget.id,
      creditLimit: 50000,
      carrierConfig: { preferredCarrier: 'DHL', traderType: 'business' }
    },
    {
      email: 'accounting@demo.com',
      name: 'Hessa Al-Bahar',
      role: 'accounting',
      phone: '+965 9000 0003',
      organizationId: orgTarget.id,
      creditLimit: 25000,
      carrierConfig: { preferredCarrier: 'DHL', traderType: 'business' }
    },
    {
      email: 'staff@demo.com',
      name: 'Bader Al-Mutawa',
      role: 'staff',
      phone: '+965 9000 0004',
      organizationId: orgTarget.id,
      creditLimit: 10000,
      carrierConfig: { preferredCarrier: 'DGR', traderType: 'business' }
    },
    {
      email: 'driver@demo.com',
      name: 'Ahmed Courier Driver',
      role: 'driver',
      phone: '+965 9000 0005',
      organizationId: orgTarget.id,
      creditLimit: 5000,
      carrierConfig: { preferredCarrier: 'MANUAL', traderType: 'individual' }
    },
    {
      email: 'org_manager@demo.com',
      name: 'Yousef Al-Mutawa (Manager)',
      role: 'org_manager',
      phone: '+965 9911 2233',
      organizationId: orgGulfApex.id,
      creditLimit: 15000,
      carrierConfig: { preferredCarrier: 'DGR', traderType: 'business' }
    },
    {
      email: 'org_agent@demo.com',
      name: 'Zaid Al-Harbi (Agent)',
      role: 'org_agent',
      phone: '+965 9911 2234',
      organizationId: orgGulfApex.id,
      creditLimit: 15000,
      carrierConfig: { preferredCarrier: 'DGR', traderType: 'business' }
    },
    {
      email: 'client@demo.com',
      name: 'Dalal Al-Khaled (Direct Shipper)',
      role: 'client',
      phone: '+965 9988 7766',
      organizationId: null,
      creditLimit: 750,
      carrierConfig: { preferredCarrier: 'DHL', traderType: 'individual' }
    }
  ];

  const seededUsers = {};
  for (const u of rolesToSeed) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        phone: u.phone,
        password: commonPassword,
        organizationId: u.organizationId,
        creditLimit: u.creditLimit,
        carrierConfig: u.carrierConfig,
        addresses: demoAddresses,
        active: true
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        phone: u.phone,
        password: commonPassword,
        organizationId: u.organizationId,
        creditLimit: u.creditLimit,
        carrierConfig: u.carrierConfig,
        addresses: demoAddresses,
        active: true
      }
    });
    seededUsers[u.role] = user;
    console.log(`✓ Seeded user: ${u.email} [${u.role}]`);
  }

  // Also alias dgr@demo.com to org_agent
  await prisma.user.upsert({
    where: { email: 'dgr@demo.com' },
    update: {
      name: 'DGR Dangerous Goods Specialist',
      role: 'org_agent',
      phone: '+965 9911 2299',
      password: commonPassword,
      organizationId: orgAlSabah.id,
      creditLimit: 25000,
      carrierConfig: { preferredCarrier: 'DGR', traderType: 'business' },
      addresses: demoAddresses,
      active: true
    },
    create: {
      email: 'dgr@demo.com',
      name: 'DGR Dangerous Goods Specialist',
      role: 'org_agent',
      phone: '+965 9911 2299',
      password: commonPassword,
      organizationId: orgAlSabah.id,
      creditLimit: 25000,
      carrierConfig: { preferredCarrier: 'DGR', traderType: 'business' },
      addresses: demoAddresses,
      active: true
    }
  });

  // ── 3. Seed User Access Scopes (Staff & Driver) ─────────────────────
  console.log('\n🔐 Seeding Access Scopes for Operations Staff & Drivers...');
  await prisma.userAccessScope.deleteMany({
    where: {
      userId: { in: [seededUsers.staff.id, seededUsers.driver.id] }
    }
  });

  await prisma.userAccessScope.createMany({
    data: [
      {
        userId: seededUsers.staff.id,
        organizationId: orgGulfApex.id,
        scopeType: 'COMPANY_ALL_USERS',
        canCreateOnBehalf: true,
        canViewShipments: true,
        active: true
      },
      {
        userId: seededUsers.staff.id,
        organizationId: orgAlSabah.id,
        scopeType: 'COMPANY_ALL_USERS',
        canCreateOnBehalf: true,
        canViewShipments: true,
        active: true
      },
      {
        userId: seededUsers.driver.id,
        organizationId: orgGulfApex.id,
        scopeType: 'COMPANY_ALL_USERS',
        canCreateOnBehalf: false,
        canViewShipments: true,
        active: true
      }
    ]
  });
  console.log('✓ Operational access scopes configured.');

  // ── 4. Seed Consignments Across All Operational States ─────────────
  console.log('\n📦 Seeding Demo Consignments across Lifecycle States...');

  const demoShipments = [
    {
      trackingNumber: 'DGR-KW-DEMO-001',
      status: 'pending',
      userId: seededUsers.org_agent.id,
      organizationId: orgAlSabah.id,
      carrierCode: 'DGR',
      serviceCode: 'Y',
      price: 45.000,
      costPrice: 38.000,
      markupAmount: 7.000,
      currency: 'KWD',
      shipmentType: 'package',
      packagingType: 'user',
      origin: {
        contactPerson: 'Dr. Fatima Al-Sabah',
        company: 'Al-Sabah Medical & Pharma',
        phone: '+965 9955 4433',
        email: 'logistics@alsabahmed.kw',
        city: 'Kuwait City',
        countryCode: 'KW',
        streetLines: ['Al-Sour Street, Commercial Area 9'],
        postalCode: '13001',
        dangerousGoods: {
          contains: true,
          unCode: 'UN1266',
          properShippingName: 'PERFUMERY PRODUCTS with flammable solvents',
          hazardClass: '3',
          packingGroup: 'III',
          serviceCode: 'Y',
          contentId: 'PERFUME_CONCENTRATE',
          customDescription: 'Luxury Fragrance Extracts - Flammable liquid solvents'
        }
      },
      destination: {
        contactPerson: 'James Thornton',
        company: 'Harrods Premium Services',
        phone: '+44 20 7946 0912',
        email: 'concierge@harrods.co.uk',
        city: 'London',
        countryCode: 'GB',
        streetLines: ['87 Brompton Road, Knightsbridge'],
        postalCode: 'SW1X 7XL'
      },
      parcels: [
        { length: 25, width: 20, height: 15, weight: 3.5, description: 'Fragrance Oils' }
      ],
      pricingSnapshot: {
        isTest: true,
        environment: 'test',
        baseRate: 38.000,
        markup: 7.000,
        total: 45.000,
        currency: 'KWD'
      }
    },
    {
      trackingNumber: 'TRK-KW-READY-002',
      status: 'ready_for_pickup',
      userId: seededUsers.org_agent.id,
      organizationId: orgGulfApex.id,
      assignedDriverId: seededUsers.driver.id,
      carrierCode: 'DHL',
      serviceCode: 'P',
      price: 18.500,
      costPrice: 15.000,
      markupAmount: 3.500,
      currency: 'KWD',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading W.L.L.',
        phone: '+965 9911 2233',
        city: 'Shuwaikh',
        countryCode: 'KW',
        streetLines: ['Street 28, Block 1, Warehouse 44B']
      },
      destination: {
        contactPerson: 'Fahad Al-Dossary',
        company: 'Apex Saudi Logistics',
        phone: '+966 50 123 4567',
        city: 'Riyadh',
        countryCode: 'SA',
        streetLines: ['King Fahd Road, Al-Olaya District']
      },
      parcels: [{ length: 30, width: 25, height: 20, weight: 5.0, description: 'Retail Electronics' }]
    },
    {
      trackingNumber: 'TRK-KW-PICKED-003',
      status: 'picked_up',
      userId: seededUsers.org_agent.id,
      organizationId: orgGulfApex.id,
      assignedDriverId: seededUsers.driver.id,
      carrierCode: 'ARAMEX',
      serviceCode: 'P',
      price: 22.000,
      costPrice: 18.000,
      markupAmount: 4.000,
      currency: 'KWD',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading W.L.L.',
        phone: '+965 9911 2233',
        city: 'Kuwait City',
        countryCode: 'KW',
        streetLines: ['Commercial Area 9']
      },
      destination: {
        contactPerson: 'Rashid Al-Maktoum',
        company: 'Dubai South DWC Hub',
        phone: '+971 50 987 6543',
        city: 'Dubai',
        countryCode: 'AE',
        streetLines: ['Dubai Logistics City, Building B3']
      },
      parcels: [{ length: 40, width: 30, height: 25, weight: 8.0, description: 'Commercial Samples' }]
    },
    {
      trackingNumber: 'DGR-KW-MANIFEST-004',
      status: 'created',
      userId: seededUsers.org_agent.id,
      organizationId: orgAlSabah.id,
      carrierCode: 'DHL',
      serviceCode: 'P',
      dhlTrackingNumber: '9876543210',
      dhlConfirmed: true,
      carrierShipmentId: 'DHL-KW-9876543210',
      price: 64.250,
      costPrice: 55.000,
      markupAmount: 9.250,
      currency: 'KWD',
      origin: {
        contactPerson: 'Dr. Fatima Al-Sabah',
        company: 'Al-Sabah Medical Hub',
        phone: '+965 9955 4433',
        city: 'Kuwait City',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Stefan Schmidt',
        company: 'Frankfurt Central Healthcare',
        phone: '+49 69 1234 5678',
        city: 'Frankfurt',
        countryCode: 'DE'
      },
      parcels: [{ length: 35, width: 30, height: 25, weight: 6.2, description: 'Medical Diagnostics' }]
    },
    {
      trackingNumber: 'TRK-KW-TRANSIT-005',
      status: 'in_transit',
      userId: seededUsers.client.id,
      carrierCode: 'DHL',
      serviceCode: 'P',
      dhlTrackingNumber: '4411223344',
      price: 31.000,
      costPrice: 26.000,
      markupAmount: 5.000,
      currency: 'KWD',
      origin: {
        contactPerson: 'Dalal Al-Khaled',
        phone: '+965 9988 7766',
        city: 'Kuwait City',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Sara Al-Nuaimi',
        phone: '+971 50 112 2334',
        city: 'Dubai',
        countryCode: 'AE'
      },
      checkpoints: [
        {
          status: 'created',
          timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
          location: 'Kuwait Cargo Gateway',
          description: 'Shipment manifest generated'
        },
        {
          status: 'picked_up',
          timestamp: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
          location: 'Shuwaikh Sort Center',
          description: 'Picked up by Target Logistics courier'
        },
        {
          status: 'in_transit',
          timestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
          location: 'Kuwait Int. Airport (KWI)',
          description: 'Departed on Flight KU-105'
        },
        {
          status: 'in_transit',
          timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          location: 'Dubai Sort Facility (DXB)',
          description: 'Arrived at international distribution hub'
        }
      ],
      parcels: [{ length: 20, width: 20, height: 15, weight: 2.0, description: 'Handcrafted Goods' }]
    },
    {
      trackingNumber: 'TRK-KW-OUTDEL-006',
      status: 'out_for_delivery',
      userId: seededUsers.org_agent.id,
      organizationId: orgGulfApex.id,
      carrierCode: 'ARAMEX',
      serviceCode: 'P',
      carrierShipmentId: 'SA-882190',
      price: 14.500,
      costPrice: 12.000,
      markupAmount: 2.500,
      currency: 'KWD',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading W.L.L.',
        phone: '+965 9911 2233',
        city: 'Kuwait City',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Mona Al-Othman',
        company: 'Al-Othman Boutique',
        phone: '+966 55 998 8776',
        city: 'Riyadh',
        countryCode: 'SA',
        streetLines: ['Olaya Main Street, Boutique Tower 3']
      },
      parcels: [{ length: 25, width: 20, height: 10, weight: 1.5, description: 'Designer Fashion Accessories' }]
    },
    {
      trackingNumber: 'TRK-KW-DELIVERED-007',
      status: 'delivered',
      userId: seededUsers.org_agent.id,
      organizationId: orgGulfApex.id,
      assignedDriverId: seededUsers.driver.id,
      carrierCode: 'MANUAL',
      price: 28.000,
      costPrice: 20.000,
      markupAmount: 8.000,
      currency: 'KWD',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading',
        phone: '+965 9911 2233',
        city: 'Shuwaikh',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Khaled Al-Otaibi',
        company: 'Bader General Trading',
        phone: '+965 9900 1122',
        city: 'Kuwait City',
        countryCode: 'KW',
        streetLines: ['Mirqab, Block 3, Office 12']
      },
      history: [
        {
          status: 'delivered',
          timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          signerName: 'Khaled Al-Otaibi',
          location: 'Mirqab, Kuwait City',
          notes: 'Signed and confirmed by recipient'
        }
      ],
      parcels: [{ length: 50, width: 40, height: 30, weight: 12.0, description: 'Office Equipment' }]
    },
    {
      trackingNumber: 'TRK-KW-RETURN-008',
      status: 'pending',
      userId: seededUsers.client.id,
      carrierCode: 'MANUAL',
      price: 12.000,
      currency: 'KWD',
      origin: {
        contactPerson: 'Customer Return Shipper',
        phone: '+965 9988 7766',
        city: 'Hawally',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Target Returns Depot',
        company: 'Target Logistics Center',
        phone: '+965 9000 1000',
        city: 'Shuwaikh',
        countryCode: 'KW',
        streetLines: ['Street 28, Returns Inbound Dock']
      },
      parcels: [{ length: 20, width: 15, height: 10, weight: 1.0, description: 'Exchange Return - Wrong Size' }]
    },
    {
      trackingNumber: 'TRK-KW-EXCEPTION-009',
      status: 'exception',
      userId: seededUsers.staff.id,
      organizationId: orgAlSabah.id,
      carrierCode: 'DHL',
      price: 48.500,
      currency: 'KWD',
      origin: {
        contactPerson: 'Dr. Fatima Al-Sabah',
        company: 'Al-Sabah Medical & Pharma',
        phone: '+965 9955 4433',
        city: 'Kuwait City',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Klaus Weber',
        company: 'PharmaTech Germany GmbH',
        phone: '+49 69 1234 5678',
        city: 'Frankfurt',
        countryCode: 'DE',
        streetLines: ['Mainzer Landstrasse 180']
      },
      history: [
        { status: 'created', timestamp: '2026-09-20T08:00:00Z', description: 'Air cargo waybill created' },
        { status: 'in_transit', timestamp: '2026-09-21T14:00:00Z', description: 'Departed Kuwait International Airport (KWI)' },
        { status: 'exception', timestamp: '2026-09-22T09:30:00Z', description: 'Customs Hold: Missing Commercial Invoice in Frankfurt Hub', location: 'Frankfurt Hub (FRA)' }
      ],
      parcels: [{ length: 30, width: 25, height: 20, weight: 4.2, description: 'Medical Diagnostic Consumables' }]
    },
    {
      trackingNumber: 'TRK-KW-FAILED-010',
      status: 'failed',
      userId: seededUsers.staff.id,
      organizationId: orgGulfApex.id,
      carrierCode: 'ARAMEX',
      price: 18.000,
      currency: 'KWD',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading W.L.L.',
        phone: '+965 9911 2233',
        city: 'Shuwaikh',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Sara Al-Mutairi',
        phone: '+966 55 987 6543',
        city: 'Riyadh',
        countryCode: 'SA',
        streetLines: ['Al-Olaya District, Villa 14B']
      },
      history: [
        { status: 'created', timestamp: '2026-09-21T10:00:00Z', description: 'Waybill generated for GCC road express' },
        { status: 'out_for_delivery', timestamp: '2026-09-23T08:00:00Z', description: 'Courier dispatched in Riyadh' },
        { status: 'failed', timestamp: '2026-09-23T11:45:00Z', description: 'Delivery Attempt Failed: Incomplete Address - GPS Pin Required', location: 'Riyadh Hub (RUH)' }
      ],
      parcels: [{ length: 25, width: 20, height: 15, weight: 2.5, description: 'Retail Apparel Sample Kit' }]
    },
    {
      trackingNumber: 'TRK-COD-UNREMITTED-01',
      status: 'delivered',
      userId: seededUsers.org_agent.id,
      organizationId: orgGulfApex.id,
      assignedDriverId: seededUsers.driver.id,
      carrierCode: 'MANUAL',
      price: 15.000,
      costPrice: 12.000,
      markupAmount: 3.000,
      currency: 'KWD',
      codAmount: 250.000,
      codCurrency: 'KWD',
      codStatus: 'COLLECTED',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading W.L.L.',
        phone: '+965 9911 2233',
        city: 'Shuwaikh',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Ali Al-Hassan',
        phone: '+965 5544 3322',
        city: 'Salmiya',
        countryCode: 'KW',
        streetLines: ['Salem Al Mubarak St, Bldg 4']
      },
      parcels: [{ length: 15, width: 10, height: 5, weight: 0.5, description: 'Electronics COD' }]
    },
    {
      trackingNumber: 'TRK-COD-UNREMITTED-02',
      status: 'delivered',
      userId: seededUsers.org_agent.id,
      organizationId: orgGulfApex.id,
      assignedDriverId: seededUsers.driver.id,
      carrierCode: 'MANUAL',
      price: 12.000,
      costPrice: 10.000,
      markupAmount: 2.000,
      currency: 'KWD',
      codAmount: 145.500,
      codCurrency: 'KWD',
      codStatus: 'COLLECTED',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading W.L.L.',
        phone: '+965 9911 2233',
        city: 'Shuwaikh',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Sara Abdullah',
        phone: '+965 6677 8899',
        city: 'Jabriya',
        countryCode: 'KW',
        streetLines: ['Block 2, Street 1']
      },
      parcels: [{ length: 20, width: 15, height: 10, weight: 1.0, description: 'Cosmetics COD' }]
    },
    {
      trackingNumber: 'TRK-COD-REMITTED-03',
      status: 'delivered',
      userId: seededUsers.org_agent.id,
      organizationId: orgGulfApex.id,
      assignedDriverId: seededUsers.driver.id,
      carrierCode: 'MANUAL',
      price: 25.000,
      costPrice: 18.000,
      markupAmount: 7.000,
      currency: 'KWD',
      codAmount: 300.000,
      codCurrency: 'KWD',
      codStatus: 'REMITTED',
      origin: {
        contactPerson: 'Yousef Al-Mutawa',
        company: 'Gulf Apex Trading W.L.L.',
        phone: '+965 9911 2233',
        city: 'Shuwaikh',
        countryCode: 'KW'
      },
      destination: {
        contactPerson: 'Retail Store A',
        phone: '+965 2233 4455',
        city: 'Farwaniya',
        countryCode: 'KW',
        streetLines: ['Habib Munawer St']
      },
      parcels: [{ length: 30, width: 30, height: 20, weight: 5.0, description: 'Wholesale COD' }]
    }
  ];

  for (const s of demoShipments) {
    await prisma.shipment.upsert({
      where: { trackingNumber: s.trackingNumber },
      update: {
        status: s.status,
        userId: s.userId,
        organizationId: s.organizationId,
        assignedDriverId: s.assignedDriverId,
        carrierCode: s.carrierCode,
        serviceCode: s.serviceCode,
        price: s.price,
        costPrice: s.costPrice,
        markupAmount: s.markupAmount,
        currency: s.currency,
        paid: s.paid !== undefined ? s.paid : (s.status === 'delivered'),
        remainingBalance: (s.paid || s.status === 'delivered') ? 0 : (s.price || 0),
        totalPaid: (s.paid || s.status === 'delivered') ? (s.price || 0) : 0,
        origin: s.origin,
        destination: s.destination,
        parcels: s.parcels,
        pricingSnapshot: s.pricingSnapshot,
        checkpoints: s.checkpoints,
        history: s.history,
        dhlTrackingNumber: s.dhlTrackingNumber,
        dhlConfirmed: s.dhlConfirmed || false,
        carrierShipmentId: s.carrierShipmentId,
        codAmount: s.codAmount,
        codCurrency: s.codCurrency,
        codStatus: s.codStatus
      },
      create: {
        trackingNumber: s.trackingNumber,
        status: s.status,
        userId: s.userId,
        organizationId: s.organizationId,
        assignedDriverId: s.assignedDriverId,
        carrierCode: s.carrierCode,
        serviceCode: s.serviceCode,
        price: s.price,
        costPrice: s.costPrice,
        markupAmount: s.markupAmount,
        currency: s.currency,
        paid: s.paid !== undefined ? s.paid : (s.status === 'delivered'),
        remainingBalance: (s.paid || s.status === 'delivered') ? 0 : (s.price || 0),
        totalPaid: (s.paid || s.status === 'delivered') ? (s.price || 0) : 0,
        origin: s.origin,
        destination: s.destination,
        parcels: s.parcels,
        pricingSnapshot: s.pricingSnapshot,
        checkpoints: s.checkpoints,
        history: s.history,
        dhlTrackingNumber: s.dhlTrackingNumber,
        dhlConfirmed: s.dhlConfirmed || false,
        carrierShipmentId: s.carrierShipmentId,
        codAmount: s.codAmount,
        codCurrency: s.codCurrency,
        codStatus: s.codStatus
      }
    });
    console.log(`✓ Seeded shipment: ${s.trackingNumber} [${s.status}] (${s.carrierCode})`);
  }

  // ── 5. Seed Invoices & Financial Ledger ────────────────────────────
  console.log('\n💳 Seeding Invoices & Organization Ledger History...');

  const inv1 = await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-2026-08-001' },
    update: {
      organizationId: orgGulfApex.id,
      periodStart: new Date('2026-08-01T00:00:00Z'),
      periodEnd: new Date('2026-08-31T23:59:59Z'),
      subtotal: 450.000,
      vat: 0.000,
      total: 450.000,
      currency: 'KWD',
      status: 'sent',
      notes: 'Monthly corporate logistics statement for August 2026.'
    },
    create: {
      invoiceNumber: 'INV-2026-08-001',
      organizationId: orgGulfApex.id,
      periodStart: new Date('2026-08-01T00:00:00Z'),
      periodEnd: new Date('2026-08-31T23:59:59Z'),
      subtotal: 450.000,
      vat: 0.000,
      total: 450.000,
      currency: 'KWD',
      status: 'sent',
      notes: 'Monthly corporate logistics statement for August 2026.'
    }
  });

  const inv2 = await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-2026-07-001' },
    update: {
      organizationId: orgGulfApex.id,
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-31T23:59:59Z'),
      subtotal: 820.000,
      vat: 0.000,
      total: 820.000,
      currency: 'KWD',
      status: 'paid',
      paidAt: new Date('2026-08-05T14:30:00Z'),
      notes: 'Monthly corporate logistics statement for July 2026 - Settled via KNET.'
    },
    create: {
      invoiceNumber: 'INV-2026-07-001',
      organizationId: orgGulfApex.id,
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-31T23:59:59Z'),
      subtotal: 820.000,
      vat: 0.000,
      total: 820.000,
      currency: 'KWD',
      status: 'paid',
      paidAt: new Date('2026-08-05T14:30:00Z'),
      notes: 'Monthly corporate logistics statement for July 2026 - Settled via KNET.'
    }
  });

  // Seed sample ledger records
  const existingLedger = await prisma.organizationLedger.count({
    where: { organizationId: orgGulfApex.id }
  });

  if (existingLedger === 0) {
    await prisma.organizationLedger.createMany({
      data: [
        {
          organizationId: orgGulfApex.id,
          amount: 820.000,
          currency: 'KWD',
          entryType: 'DEBIT',
          category: 'INVOICE_GENERATION',
          description: 'Invoice INV-2026-07-001 issued',
          reference: 'INV-2026-07-001',
          balanceAfter: 820.000,
          createdAt: new Date('2026-08-01T08:00:00Z')
        },
        {
          organizationId: orgGulfApex.id,
          amount: 820.000,
          currency: 'KWD',
          entryType: 'CREDIT',
          category: 'PAYMENT_RECEIVED',
          description: 'Payment settled via KNET Gateway Ref #KNT-998822',
          reference: 'PAY-2026-08-001',
          balanceAfter: 0.000,
          createdAt: new Date('2026-08-05T14:30:00Z')
        },
        {
          organizationId: orgGulfApex.id,
          amount: 450.000,
          currency: 'KWD',
          entryType: 'DEBIT',
          category: 'INVOICE_GENERATION',
          description: 'Invoice INV-2026-08-001 issued',
          reference: 'INV-2026-08-001',
          balanceAfter: 450.000,
          createdAt: new Date('2026-09-01T08:00:00Z')
        }
      ]
    });
  }
  console.log(`✓ 2 Invoices & sample ledger history seeded.`);

  // ── 6. Export Showcase Manifest Dump File ──────────────────────────
  const dumpDir = path.join(__dirname, 'dumps');
  if (!fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  const showcaseSummary = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    credentials: {
      defaultPassword: 'password123',
      quickLoginUrl: 'http://localhost:3030/login',
      accounts: rolesToSeed.map(u => ({
        email: u.email,
        role: u.role,
        name: u.name,
        phone: u.phone
      }))
    },
    organizations: [
      { name: orgTarget.name, type: orgTarget.type, creditLimit: '100,000 KWD' },
      { name: orgGulfApex.name, type: orgGulfApex.type, creditLimit: '15,000 KWD' },
      { name: orgAlSabah.name, type: orgAlSabah.type, creditLimit: '25,000 KWD' },
      { name: orgGov.name, type: orgGov.type, creditLimit: '50,000 KWD' }
    ],
    showcaseConsignments: demoShipments.map(s => ({
      trackingNumber: s.trackingNumber,
      status: s.status,
      carrierCode: s.carrierCode,
      destination: s.destination?.countryCode || 'KW',
      description: s.parcels?.[0]?.description || 'Consignment'
    }))
  };

  const dumpPath = path.join(dumpDir, 'showcase_demo_dump.json');
  fs.writeFileSync(dumpPath, JSON.stringify(showcaseSummary, null, 2), 'utf-8');
  console.log(`\n💾 Exported demo showcase manifest dump: ${dumpPath}`);

  // ── 7. Seed Enterprise Chart of Accounts & Banking ─────────────────
  console.log('\n🏛️  Seeding Enterprise Chart of Accounts, Banking & Periods...');
  await seedAccounting();

  console.log('\n====================================================');
  console.log('✅ SHOWCASE SEED COMPLETED SUCCESSFULLY!');
  console.log('   All 8 roles ready for client demo with password123');
  console.log('====================================================\n');
}

seedShowcaseDemo()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
