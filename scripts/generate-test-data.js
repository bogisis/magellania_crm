#!/usr/bin/env node

/**
 * Generate 1000 diverse test estimates for performance testing
 * All estimates are marked with isTestData: true for easy cleanup
 */

const SQLiteStorage = require('../storage/SQLiteStorage');
const path = require('path');

// Configuration
const TEST_COUNT = 1000;
const DB_PATH = path.join(__dirname, '../db/quotes.db');

// Test data generators
const REGIONS = ['Ushuaia', 'El Calafate', 'Buenos Aires', 'Patagonia', 'Bariloche', 'Mendoza', 'Salta'];
const FIRST_NAMES = ['John', 'Maria', 'Alex', 'Sarah', 'Michael', 'Anna', 'David', 'Emma', 'James', 'Sofia'];
const LAST_NAMES = ['Smith', 'Johnson', 'Garcia', 'Martinez', 'Rodriguez', 'Wilson', 'Anderson', 'Taylor'];
const SERVICE_TYPES = [
    'Transfer', 'City Tour', 'Penguin Excursion', 'Hiking', 'Boat Trip',
    'Wine Tasting', 'Museum Visit', 'Glacier Tour', 'Horse Riding', 'Kayaking'
];

// Utilities
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
    return array[randomInt(0, array.length - 1)];
}

function randomDate(start, end) {
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date.toISOString().split('T')[0];
}

function generateId() {
    return 'xxxxxxxxxxxx'.replace(/x/g, () => {
        return (Math.random() * 16 | 0).toString(16);
    });
}

function generateClientName() {
    return `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;
}

function generatePhone() {
    return `+${randomInt(1, 99)} ${randomInt(100, 999)} ${randomInt(1000000, 9999999)}`;
}

function generateEmail(name) {
    const domain = randomChoice(['gmail.com', 'yahoo.com', 'hotmail.com', 'test.com']);
    return `${name.toLowerCase().replace(' ', '.')}@${domain}`;
}

function generateService(day, serviceIndex) {
    const region = randomChoice(REGIONS);
    const serviceType = randomChoice(SERVICE_TYPES);
    const price = randomInt(50, 1000);
    const quantity = randomInt(1, 10);
    const markup = randomChoice([0, 5, 10, 15, 20]);

    return {
        id: `${Date.now()}${serviceIndex}`,
        name: `${serviceType} in ${region}`,
        description: `Test service: ${serviceType} - Day ${day}`,
        day: day,
        price: price,
        quantity: quantity,
        markup: markup,
        contractor: randomChoice(['Test Company A', 'Test Company B', 'Test Company C', '']),
        excludeFromMarkup: Math.random() < 0.2,
        fullProfit: Math.random() < 0.1,
        region: region,
        done: Math.random() < 0.5,
        paid: Math.random() < 0.3,
        comment: Math.random() < 0.3 ? `Test comment ${serviceIndex}` : '',
        prepayment: Math.random() < 0.5 ? String(randomInt(100, 500)) : undefined,
        startTime: `${randomInt(8, 18)}:${randomChoice(['00', '15', '30', '45'])}`,
        endTime: `${randomInt(10, 20)}:${randomChoice(['00', '15', '30', '45'])}`
    };
}

function generateHotel(day, index) {
    return {
        id: `${Date.now()}${index}h`,
        name: `Hotel ${randomChoice(['Plaza', 'Continental', 'Grand', 'Royal', 'Imperial'])} ${randomChoice(REGIONS)}`,
        description: `${randomChoice(['3', '4', '5'])}-star hotel, Test booking ${index}`,
        day: day,
        price: randomInt(100, 500),
        quantity: randomInt(1, 5),
        markup: randomChoice([0, 10, 15, 20]),
        contractor: randomChoice(['Booking.com', 'Hotels.com', 'Direct', 'Test Agency']),
        excludeFromMarkup: Math.random() < 0.1,
        region: randomChoice(REGIONS),
        done: Math.random() < 0.4,
        paid: Math.random() < 0.3,
        comment: Math.random() < 0.2 ? `Test hotel note ${index}` : ''
    };
}

function generateFlight(day, index) {
    const origins = ['Buenos Aires', 'Ushuaia', 'El Calafate', 'Bariloche'];
    const airlines = ['Aerolineas Argentinas', 'LATAM', 'Andes', 'Test Airways'];

    return {
        id: `${Date.now()}${index}f`,
        name: `${randomChoice(origins)} - ${randomChoice(origins)}`,
        description: `Flight with ${randomChoice(airlines)}, Test booking ${index}`,
        day: day,
        price: randomInt(200, 800),
        quantity: randomInt(1, 10),
        markup: randomChoice([0, 5, 10]),
        contractor: randomChoice(airlines),
        excludeFromMarkup: Math.random() < 0.05,
        region: 'N/A',
        done: Math.random() < 0.5,
        paid: Math.random() < 0.4,
        comment: Math.random() < 0.3 ? `Test flight note ${index}` : ''
    };
}

function generateEstimate(index) {
    const clientName = generateClientName();
    const paxCount = randomInt(1, 50);
    const startDate = randomDate(new Date(2025, 0, 1), new Date(2027, 11, 31));
    const endDate = randomDate(new Date(startDate), new Date(new Date(startDate).getTime() + 30 * 24 * 60 * 60 * 1000));

    // Generate variable number of services, hotels, flights
    const serviceCount = randomInt(1, 20);
    const hotelCount = randomInt(0, 5);
    const flightCount = randomInt(0, 3);

    const services = [];
    for (let i = 0; i < serviceCount; i++) {
        services.push(generateService(randomInt(1, 10), i));
    }

    const hotels = [];
    for (let i = 0; i < hotelCount; i++) {
        hotels.push(generateHotel(randomInt(1, 10), i));
    }

    const flights = [];
    for (let i = 0; i < flightCount; i++) {
        flights.push(generateFlight(randomInt(1, 10), i));
    }

    const otherServices = [];
    if (Math.random() < 0.3) {
        for (let i = 0; i < randomInt(1, 3); i++) {
            otherServices.push({
                id: `${Date.now()}${i}o`,
                name: `Other Service ${i + 1}`,
                description: `Miscellaneous test service`,
                day: randomInt(1, 10),
                price: randomInt(50, 300),
                quantity: randomInt(1, 5),
                markup: randomChoice([0, 10, 15]),
                contractor: 'Test Provider',
                excludeFromMarkup: false,
                region: randomChoice(REGIONS),
                done: false,
                paid: false,
                comment: ''
            });
        }
    }

    return {
        id: generateId(),
        version: '1.1.0',
        timestamp: new Date().toISOString(),
        clientName: clientName,
        clientPhone: generatePhone(),
        clientEmail: generateEmail(clientName),
        paxCount: paxCount,
        tourStart: startDate,
        tourEnd: endDate,
        services: services,
        hotels: hotels,
        flights: flights,
        otherServices: otherServices,
        hiddenMarkup: randomChoice([0, 5, 10, 15]),
        taxRate: randomChoice([0, 10, 21]),
        programDescription: `<p>Test estimate ${index} - Auto-generated for testing</p>`,
        quoteComments: Math.random() < 0.5 ? `<p>Test comment for estimate ${index}</p>` : '',
        // Mark as test data for easy cleanup
        isTestData: true,
        testDataIndex: index
    };
}

// Main execution
async function main() {
    console.log('======================================================================');
    console.log('🧪 Test Data Generator - 1000 Estimates');
    console.log('======================================================================\n');

    // Initialize storage
    const storage = new SQLiteStorage({ dbPath: DB_PATH });
    await storage.init();
    console.log('✓ SQLite storage initialized\n');

    console.log(`Generating ${TEST_COUNT} test estimates...`);
    console.log('Progress: ');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const startTime = Date.now();

    for (let i = 1; i <= TEST_COUNT; i++) {
        try {
            const estimate = generateEstimate(i);
            const filename = `test_estimate_${i}_${estimate.clientName.toLowerCase().replace(' ', '_')}_${estimate.tourStart}_${estimate.paxCount}pax_${estimate.id}.json`;

            // Save to database
            await storage.saveEstimate(filename, estimate);
            successCount++;

            // Progress indicator
            if (i % 100 === 0) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`  ${i}/${TEST_COUNT} (${elapsed}s)`);
            }
        } catch (err) {
            errorCount++;
            errors.push({ index: i, error: err.message });

            if (errorCount < 10) {
                console.error(`  ❌ Error at index ${i}: ${err.message}`);
            }
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n======================================================================');
    console.log('📊 Generation Summary');
    console.log('======================================================================\n');
    console.log(`Total time: ${totalTime}s`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Rate: ${(successCount / parseFloat(totalTime)).toFixed(1)} estimates/second`);

    if (errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        errors.slice(0, 10).forEach(e => {
            console.log(`  - Index ${e.index}: ${e.error}`);
        });
        if (errors.length > 10) {
            console.log(`  ... and ${errors.length - 10} more`);
        }
    }

    // Verify database state
    console.log('\n======================================================================');
    console.log('🔍 Database Verification');
    console.log('======================================================================\n');

    const stats = await storage.getStats();
    console.log(`Total estimates in DB: ${stats.estimatesCount}`);
    console.log(`Test estimates: ${stats.estimatesCount - 6}`); // Subtract original 6
    if (stats.storageSizeFormatted) {
        console.log(`Storage size: ${stats.storageSizeFormatted}`);
    }

    await storage.close();

    console.log('\n✅ Test data generation completed!\n');
    console.log('To clean up test data later, run:');
    console.log('  DELETE FROM estimates WHERE json_extract(data, \'$.isTestData\') = 1;\n');
}

// Run
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
