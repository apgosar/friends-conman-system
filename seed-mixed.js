const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedMockProject() {
  const project = await prisma.project.create({
    data: {
      name: 'Skyline Mixed-Use Tower',
      address: 'Andheri East, Mumbai',
      city: 'Mumbai',
      type: 'MIXED',
      status: 'UNDER_CONSTRUCTION',
      companyName: 'PARADIGM FRIENDS REALTORS LLP',
      companyAddress: '45 Builder Tower, Mumbai',
      wings: {
        create: [
          {
            name: 'A',
            totalFloors: 15,
            floors: {
              create: [
                // Ground Floor: 5 Shops
                {
                  floorNumber: 0,
                  floorPlanUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop',
                  units: {
                    create: Array.from({ length: 5 }).map((_, i) => ({
                      unitNumber: `G-0${i + 1}`,
                      configuration: 'SHOP',
                      carpetAreaSqft: 200 + (i * 50),
                      status: 'AVAILABLE'
                    }))
                  }
                },
                // 1st Floor: 3 Commercial
                {
                  floorNumber: 1,
                  floorPlanUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop',
                  units: {
                    create: Array.from({ length: 3 }).map((_, i) => ({
                      unitNumber: `10${i + 1}`,
                      configuration: 'COMMERCIAL',
                      carpetAreaSqft: 500 + (i * 100),
                      status: 'AVAILABLE'
                    }))
                  }
                },
                // 2nd Floor: 3 Commercial
                {
                  floorNumber: 2,
                  floorPlanUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop',
                  units: {
                    create: Array.from({ length: 3 }).map((_, i) => ({
                      unitNumber: `20${i + 1}`,
                      configuration: 'COMMERCIAL',
                      carpetAreaSqft: 500 + (i * 100),
                      status: 'AVAILABLE'
                    }))
                  }
                },
                // 3rd to 14th Floor: Flats
                ...Array.from({ length: 12 }).map((_, i) => {
                  const floorNum = i + 3;
                  return {
                    floorNumber: floorNum,
                    floorPlanUrl: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?q=80&w=800&auto=format&fit=crop',
                    units: {
                      create: [
                        { unitNumber: `${floorNum}01`, configuration: '1BHK', carpetAreaSqft: 450, status: 'AVAILABLE' },
                        { unitNumber: `${floorNum}02`, configuration: '2BHK', carpetAreaSqft: 650, status: 'AVAILABLE' },
                        { unitNumber: `${floorNum}03`, configuration: '2BHK', carpetAreaSqft: 700, status: 'AVAILABLE' },
                        { unitNumber: `${floorNum}04`, configuration: '3BHK', carpetAreaSqft: 950, status: 'AVAILABLE' },
                      ]
                    }
                  }
                })
              ]
            }
          }
        ]
      }
    }
  });

  console.log(`Created Project: ${project.name}`);
}

seedMockProject()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
