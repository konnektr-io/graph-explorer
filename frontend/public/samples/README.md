# Sample DTDL Models

This directory contains sample Digital Twin Definition Language (DTDL) models organized by domain. These models are used for the onboarding experience to help new users get started quickly.

## Domains

### Business & CRM (`business/`)

Customer relationship management and business process models:

- BaseEntity.json
- Party.json, Person.json, Organization.json
- Customer.json, Product.json
- Opportunity.json, SalesOrder.json
- Interaction.json, EmailInteraction.json, SocialSignal.json
- AgentInsight.json

### Facility Management (`facility/`)

Building and facility infrastructure models:

- BaseFacilityEntity.json
- Building.json, Floor.json, Room.json, Space.json
- Equipment.json, HVACUnit.json, Sensor.json
- MaintenanceTicket.json

### Healthcare (`healthcare/`)

Medical and healthcare workflow models:

- BaseHealthEntity.json
- Patient.json, Practitioner.json
- Observation.json, Condition.json
- Encounter.json, CarePlan.json
- MedicalDevice.json

### Manufacturing (`manufacturing/`)

Industrial and production process models:

- BaseManufacturingEntity.json
- Factory.json, ProductionLine.json
- Machine.json, RobotArm.json
- Product.json, WorkOrder.json
- Defect.json

## Source

These models are sourced from the [dtdl-ontologies](https://github.com/konnektr-io/dtdl-ontologies) repository and are copied locally for faster loading and offline support.

## Usage

The onboarding dialog (`OnboardingDialog.tsx`) uses the `sampleDataLoader.ts` utility to fetch these models when a user selects a sample domain. Sample twins are then automatically generated based on the model schemas using `sampleTwinGenerator.ts`.
