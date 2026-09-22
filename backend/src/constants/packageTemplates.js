/**
 * Standard Package Templates for Target Logistics
 * Predefined physical box/flyer specifications optimized for GCC routes.
 */

const SYSTEM_PACKAGE_TEMPLATES = [
    {
        id: 'target_flyer_doc',
        name: 'Target Flyer / Document Bag',
        category: 'Flyer',
        length: 35,
        width: 25,
        height: 3,
        weight: 0.5,
        maxWeight: 2.0,
        description: 'Padded courier flyer for documents, contracts, passports, and small flat items.'
    },
    {
        id: 'target_box_small',
        name: 'Target Box A (Small)',
        category: 'Box',
        length: 25,
        width: 20,
        height: 15,
        weight: 1.5,
        maxWeight: 5.0,
        description: 'Ideal for perfumes, cosmetics, watches, electronics, and accessories.'
    },
    {
        id: 'target_box_medium',
        name: 'Target Box B (Medium Apparel)',
        category: 'Box',
        length: 40,
        width: 30,
        height: 20,
        weight: 3.5,
        maxWeight: 10.0,
        description: 'Standard shoebox or apparel carton for clothing, shoes, and retail orders.'
    },
    {
        id: 'target_box_large',
        name: 'Target Box C (Large Carton)',
        category: 'Box',
        length: 50,
        width: 40,
        height: 30,
        weight: 7.0,
        maxWeight: 20.0,
        description: 'Large multi-item consignment or bulk textile/homeware order.'
    },
    {
        id: 'target_box_heavy',
        name: 'Target Heavy Freight Box',
        category: 'Freight',
        length: 60,
        width: 50,
        height: 45,
        weight: 15.0,
        maxWeight: 35.0,
        description: 'Double-walled heavy-duty carton for industrial parts and machinery.'
    }
];

module.exports = {
    SYSTEM_PACKAGE_TEMPLATES
};
