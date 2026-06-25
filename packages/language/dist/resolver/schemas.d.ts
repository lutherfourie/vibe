import { z } from "zod";
export type Branded<T, Brand> = T & {
    __brand: Brand;
};
export type LaneId = Branded<string, "LaneId">;
export type CheckpointId = Branded<string, "CheckpointId">;
export type AutonomousSessionId = Branded<string, "AutonomousSessionId">;
export declare const CheckpointSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    after: z.ZodOptional<z.ZodString>;
    contract: z.ZodOptional<z.ZodString>;
    resumeStrategy: z.ZodEnum<{
        "last-checkpoint": "last-checkpoint";
        "latest-plan": "latest-plan";
        explicit: "explicit";
    }>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const SelfReviewSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    perspective: z.ZodOptional<z.ZodString>;
    criteria: z.ZodArray<z.ZodString>;
    required: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ResearchStepSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    topic: z.ZodString;
    depth: z.ZodDefault<z.ZodEnum<{
        xhigh: "xhigh";
        shallow: "shallow";
        deep: "deep";
    }>>;
    sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const ToolSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    mcp: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const EvalSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    criteria: z.ZodArray<z.ZodString>;
    threshold: z.ZodOptional<z.ZodNumber>;
    llm: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const TemplateSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    prompt: z.ZodString;
    variables: z.ZodOptional<z.ZodArray<z.ZodString>>;
    fewShot: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const PolicySchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    sandbox: z.ZodDefault<z.ZodBoolean>;
    rateLimit: z.ZodOptional<z.ZodNumber>;
    auth: z.ZodOptional<z.ZodString>;
    allowedTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const WorkflowSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    steps: z.ZodOptional<z.ZodArray<z.ZodString>>;
    parallel: z.ZodDefault<z.ZodBoolean>;
    retries: z.ZodDefault<z.ZodNumber>;
    dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const CharacterSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    referencePrompt: z.ZodString;
    referenceImage: z.ZodOptional<z.ZodString>;
    consistencyRules: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const FrameReviewSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    animation: z.ZodString;
    dimensions: z.ZodArray<z.ZodString>;
    expertRoles: z.ZodArray<z.ZodString>;
    threshold: z.ZodOptional<z.ZodNumber>;
    kumaConsistency: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ConsistencyGuardSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    character: z.ZodString;
    rules: z.ZodArray<z.ZodString>;
    referenceImage: z.ZodOptional<z.ZodString>;
    autoRegenOnFail: z.ZodDefault<z.ZodBoolean>;
    expertPanel: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const GuardSchema: z.ZodObject<{
    condition: z.ZodString;
    assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const RuleSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
        condition: z.ZodString;
        assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const DirectorSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
        condition: z.ZodString;
        assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const StepSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    after: z.ZodOptional<z.ZodString>;
    contract: z.ZodOptional<z.ZodString>;
    resumeStrategy: z.ZodEnum<{
        "last-checkpoint": "last-checkpoint";
        "latest-plan": "latest-plan";
        explicit: "explicit";
    }>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    type: z.ZodLiteral<"checkpoint">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    perspective: z.ZodOptional<z.ZodString>;
    criteria: z.ZodArray<z.ZodString>;
    required: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"self-review">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    topic: z.ZodString;
    depth: z.ZodDefault<z.ZodEnum<{
        xhigh: "xhigh";
        shallow: "shallow";
        deep: "deep";
    }>>;
    sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"research">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    mcp: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"tool">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    criteria: z.ZodArray<z.ZodString>;
    threshold: z.ZodOptional<z.ZodNumber>;
    llm: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"eval">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    prompt: z.ZodString;
    variables: z.ZodOptional<z.ZodArray<z.ZodString>>;
    fewShot: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"template">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    sandbox: z.ZodDefault<z.ZodBoolean>;
    rateLimit: z.ZodOptional<z.ZodNumber>;
    auth: z.ZodOptional<z.ZodString>;
    allowedTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"policy">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    steps: z.ZodOptional<z.ZodArray<z.ZodString>>;
    parallel: z.ZodDefault<z.ZodBoolean>;
    retries: z.ZodDefault<z.ZodNumber>;
    dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"workflow">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    referencePrompt: z.ZodString;
    referenceImage: z.ZodOptional<z.ZodString>;
    consistencyRules: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"character">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    animation: z.ZodString;
    dimensions: z.ZodArray<z.ZodString>;
    expertRoles: z.ZodArray<z.ZodString>;
    threshold: z.ZodOptional<z.ZodNumber>;
    kumaConsistency: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"frame-review">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    character: z.ZodString;
    rules: z.ZodArray<z.ZodString>;
    referenceImage: z.ZodOptional<z.ZodString>;
    autoRegenOnFail: z.ZodDefault<z.ZodBoolean>;
    expertPanel: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"consistency-guard">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
        condition: z.ZodString;
        assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>>;
    type: z.ZodLiteral<"rule">;
}, z.core.$strict>, z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
        condition: z.ZodString;
        assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>>;
    type: z.ZodLiteral<"director">;
}, z.core.$strict>], "type">;
export declare const LaneSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    steps: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        after: z.ZodOptional<z.ZodString>;
        contract: z.ZodOptional<z.ZodString>;
        resumeStrategy: z.ZodEnum<{
            "last-checkpoint": "last-checkpoint";
            "latest-plan": "latest-plan";
            explicit: "explicit";
        }>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        type: z.ZodLiteral<"checkpoint">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        perspective: z.ZodOptional<z.ZodString>;
        criteria: z.ZodArray<z.ZodString>;
        required: z.ZodDefault<z.ZodBoolean>;
        type: z.ZodLiteral<"self-review">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        topic: z.ZodString;
        depth: z.ZodDefault<z.ZodEnum<{
            xhigh: "xhigh";
            shallow: "shallow";
            deep: "deep";
        }>>;
        sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
        type: z.ZodLiteral<"research">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        mcp: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"tool">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        criteria: z.ZodArray<z.ZodString>;
        threshold: z.ZodOptional<z.ZodNumber>;
        llm: z.ZodOptional<z.ZodString>;
        type: z.ZodLiteral<"eval">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        prompt: z.ZodString;
        variables: z.ZodOptional<z.ZodArray<z.ZodString>>;
        fewShot: z.ZodOptional<z.ZodArray<z.ZodString>>;
        type: z.ZodLiteral<"template">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        sandbox: z.ZodDefault<z.ZodBoolean>;
        rateLimit: z.ZodOptional<z.ZodNumber>;
        auth: z.ZodOptional<z.ZodString>;
        allowedTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
        type: z.ZodLiteral<"policy">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        steps: z.ZodOptional<z.ZodArray<z.ZodString>>;
        parallel: z.ZodDefault<z.ZodBoolean>;
        retries: z.ZodDefault<z.ZodNumber>;
        dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
        type: z.ZodLiteral<"workflow">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        referencePrompt: z.ZodString;
        referenceImage: z.ZodOptional<z.ZodString>;
        consistencyRules: z.ZodOptional<z.ZodArray<z.ZodString>>;
        type: z.ZodLiteral<"character">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        animation: z.ZodString;
        dimensions: z.ZodArray<z.ZodString>;
        expertRoles: z.ZodArray<z.ZodString>;
        threshold: z.ZodOptional<z.ZodNumber>;
        kumaConsistency: z.ZodDefault<z.ZodBoolean>;
        type: z.ZodLiteral<"frame-review">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        character: z.ZodString;
        rules: z.ZodArray<z.ZodString>;
        referenceImage: z.ZodOptional<z.ZodString>;
        autoRegenOnFail: z.ZodDefault<z.ZodBoolean>;
        expertPanel: z.ZodOptional<z.ZodArray<z.ZodString>>;
        type: z.ZodLiteral<"consistency-guard">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
            condition: z.ZodString;
            assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strict>>>;
        type: z.ZodLiteral<"rule">;
    }, z.core.$strict>, z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
            condition: z.ZodString;
            assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strict>>>;
        type: z.ZodLiteral<"director">;
    }, z.core.$strict>], "type">>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const AutonomousSessionSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    lanes: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        steps: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            after: z.ZodOptional<z.ZodString>;
            contract: z.ZodOptional<z.ZodString>;
            resumeStrategy: z.ZodEnum<{
                "last-checkpoint": "last-checkpoint";
                "latest-plan": "latest-plan";
                explicit: "explicit";
            }>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            type: z.ZodLiteral<"checkpoint">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            perspective: z.ZodOptional<z.ZodString>;
            criteria: z.ZodArray<z.ZodString>;
            required: z.ZodDefault<z.ZodBoolean>;
            type: z.ZodLiteral<"self-review">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            topic: z.ZodString;
            depth: z.ZodDefault<z.ZodEnum<{
                xhigh: "xhigh";
                shallow: "shallow";
                deep: "deep";
            }>>;
            sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
            type: z.ZodLiteral<"research">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            mcp: z.ZodOptional<z.ZodString>;
            type: z.ZodLiteral<"tool">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            criteria: z.ZodArray<z.ZodString>;
            threshold: z.ZodOptional<z.ZodNumber>;
            llm: z.ZodOptional<z.ZodString>;
            type: z.ZodLiteral<"eval">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            prompt: z.ZodString;
            variables: z.ZodOptional<z.ZodArray<z.ZodString>>;
            fewShot: z.ZodOptional<z.ZodArray<z.ZodString>>;
            type: z.ZodLiteral<"template">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            sandbox: z.ZodDefault<z.ZodBoolean>;
            rateLimit: z.ZodOptional<z.ZodNumber>;
            auth: z.ZodOptional<z.ZodString>;
            allowedTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
            type: z.ZodLiteral<"policy">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            steps: z.ZodOptional<z.ZodArray<z.ZodString>>;
            parallel: z.ZodDefault<z.ZodBoolean>;
            retries: z.ZodDefault<z.ZodNumber>;
            dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
            type: z.ZodLiteral<"workflow">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            referencePrompt: z.ZodString;
            referenceImage: z.ZodOptional<z.ZodString>;
            consistencyRules: z.ZodOptional<z.ZodArray<z.ZodString>>;
            type: z.ZodLiteral<"character">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            animation: z.ZodString;
            dimensions: z.ZodArray<z.ZodString>;
            expertRoles: z.ZodArray<z.ZodString>;
            threshold: z.ZodOptional<z.ZodNumber>;
            kumaConsistency: z.ZodDefault<z.ZodBoolean>;
            type: z.ZodLiteral<"frame-review">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            character: z.ZodString;
            rules: z.ZodArray<z.ZodString>;
            referenceImage: z.ZodOptional<z.ZodString>;
            autoRegenOnFail: z.ZodDefault<z.ZodBoolean>;
            expertPanel: z.ZodOptional<z.ZodArray<z.ZodString>>;
            type: z.ZodLiteral<"consistency-guard">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
                condition: z.ZodString;
                assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, z.core.$strict>>>;
            type: z.ZodLiteral<"rule">;
        }, z.core.$strict>, z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
                condition: z.ZodString;
                assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
            }, z.core.$strict>>>;
            type: z.ZodLiteral<"director">;
        }, z.core.$strict>], "type">>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
        config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>;
    checkpoints: z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        after: z.ZodOptional<z.ZodString>;
        contract: z.ZodOptional<z.ZodString>;
        resumeStrategy: z.ZodEnum<{
            "last-checkpoint": "last-checkpoint";
            "latest-plan": "latest-plan";
            explicit: "explicit";
        }>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>>;
    selfReviews: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        perspective: z.ZodOptional<z.ZodString>;
        criteria: z.ZodArray<z.ZodString>;
        required: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>>;
    researchSteps: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        topic: z.ZodString;
        depth: z.ZodDefault<z.ZodEnum<{
            xhigh: "xhigh";
            shallow: "shallow";
            deep: "deep";
        }>>;
        sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>>;
    resumeOnRestart: z.ZodDefault<z.ZodBoolean>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const VibePlanSchema: z.ZodObject<{
    session: z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        lanes: z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            steps: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                after: z.ZodOptional<z.ZodString>;
                contract: z.ZodOptional<z.ZodString>;
                resumeStrategy: z.ZodEnum<{
                    "last-checkpoint": "last-checkpoint";
                    "latest-plan": "latest-plan";
                    explicit: "explicit";
                }>;
                metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                type: z.ZodLiteral<"checkpoint">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                perspective: z.ZodOptional<z.ZodString>;
                criteria: z.ZodArray<z.ZodString>;
                required: z.ZodDefault<z.ZodBoolean>;
                type: z.ZodLiteral<"self-review">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                topic: z.ZodString;
                depth: z.ZodDefault<z.ZodEnum<{
                    xhigh: "xhigh";
                    shallow: "shallow";
                    deep: "deep";
                }>>;
                sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
                tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"research">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                mcp: z.ZodOptional<z.ZodString>;
                type: z.ZodLiteral<"tool">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                criteria: z.ZodArray<z.ZodString>;
                threshold: z.ZodOptional<z.ZodNumber>;
                llm: z.ZodOptional<z.ZodString>;
                type: z.ZodLiteral<"eval">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                prompt: z.ZodString;
                variables: z.ZodOptional<z.ZodArray<z.ZodString>>;
                fewShot: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"template">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                sandbox: z.ZodDefault<z.ZodBoolean>;
                rateLimit: z.ZodOptional<z.ZodNumber>;
                auth: z.ZodOptional<z.ZodString>;
                allowedTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"policy">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                steps: z.ZodOptional<z.ZodArray<z.ZodString>>;
                parallel: z.ZodDefault<z.ZodBoolean>;
                retries: z.ZodDefault<z.ZodNumber>;
                dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"workflow">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                referencePrompt: z.ZodString;
                referenceImage: z.ZodOptional<z.ZodString>;
                consistencyRules: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"character">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                animation: z.ZodString;
                dimensions: z.ZodArray<z.ZodString>;
                expertRoles: z.ZodArray<z.ZodString>;
                threshold: z.ZodOptional<z.ZodNumber>;
                kumaConsistency: z.ZodDefault<z.ZodBoolean>;
                type: z.ZodLiteral<"frame-review">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                character: z.ZodString;
                rules: z.ZodArray<z.ZodString>;
                referenceImage: z.ZodOptional<z.ZodString>;
                autoRegenOnFail: z.ZodDefault<z.ZodBoolean>;
                expertPanel: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"consistency-guard">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    condition: z.ZodString;
                    assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
                }, z.core.$strict>>>;
                type: z.ZodLiteral<"rule">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    condition: z.ZodString;
                    assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
                }, z.core.$strict>>>;
                type: z.ZodLiteral<"director">;
            }, z.core.$strict>], "type">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strict>>;
        checkpoints: z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            after: z.ZodOptional<z.ZodString>;
            contract: z.ZodOptional<z.ZodString>;
            resumeStrategy: z.ZodEnum<{
                "last-checkpoint": "last-checkpoint";
                "latest-plan": "latest-plan";
                explicit: "explicit";
            }>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strict>>;
        selfReviews: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            perspective: z.ZodOptional<z.ZodString>;
            criteria: z.ZodArray<z.ZodString>;
            required: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>>;
        researchSteps: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            topic: z.ZodString;
            depth: z.ZodDefault<z.ZodEnum<{
                xhigh: "xhigh";
                shallow: "shallow";
                deep: "deep";
            }>>;
            sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>>;
        resumeOnRestart: z.ZodDefault<z.ZodBoolean>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>;
    version: z.ZodDefault<z.ZodString>;
    generatedAt: z.ZodString;
    sourceFile: z.ZodString;
}, z.core.$strict>;
export declare const ResolverOutputSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    session: z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        lanes: z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            steps: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                after: z.ZodOptional<z.ZodString>;
                contract: z.ZodOptional<z.ZodString>;
                resumeStrategy: z.ZodEnum<{
                    "last-checkpoint": "last-checkpoint";
                    "latest-plan": "latest-plan";
                    explicit: "explicit";
                }>;
                metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                type: z.ZodLiteral<"checkpoint">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                perspective: z.ZodOptional<z.ZodString>;
                criteria: z.ZodArray<z.ZodString>;
                required: z.ZodDefault<z.ZodBoolean>;
                type: z.ZodLiteral<"self-review">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                topic: z.ZodString;
                depth: z.ZodDefault<z.ZodEnum<{
                    xhigh: "xhigh";
                    shallow: "shallow";
                    deep: "deep";
                }>>;
                sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
                tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"research">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                mcp: z.ZodOptional<z.ZodString>;
                type: z.ZodLiteral<"tool">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                criteria: z.ZodArray<z.ZodString>;
                threshold: z.ZodOptional<z.ZodNumber>;
                llm: z.ZodOptional<z.ZodString>;
                type: z.ZodLiteral<"eval">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                prompt: z.ZodString;
                variables: z.ZodOptional<z.ZodArray<z.ZodString>>;
                fewShot: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"template">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                sandbox: z.ZodDefault<z.ZodBoolean>;
                rateLimit: z.ZodOptional<z.ZodNumber>;
                auth: z.ZodOptional<z.ZodString>;
                allowedTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"policy">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                steps: z.ZodOptional<z.ZodArray<z.ZodString>>;
                parallel: z.ZodDefault<z.ZodBoolean>;
                retries: z.ZodDefault<z.ZodNumber>;
                dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"workflow">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                referencePrompt: z.ZodString;
                referenceImage: z.ZodOptional<z.ZodString>;
                consistencyRules: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"character">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                animation: z.ZodString;
                dimensions: z.ZodArray<z.ZodString>;
                expertRoles: z.ZodArray<z.ZodString>;
                threshold: z.ZodOptional<z.ZodNumber>;
                kumaConsistency: z.ZodDefault<z.ZodBoolean>;
                type: z.ZodLiteral<"frame-review">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                character: z.ZodString;
                rules: z.ZodArray<z.ZodString>;
                referenceImage: z.ZodOptional<z.ZodString>;
                autoRegenOnFail: z.ZodDefault<z.ZodBoolean>;
                expertPanel: z.ZodOptional<z.ZodArray<z.ZodString>>;
                type: z.ZodLiteral<"consistency-guard">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    condition: z.ZodString;
                    assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
                }, z.core.$strict>>>;
                type: z.ZodLiteral<"rule">;
            }, z.core.$strict>, z.ZodObject<{
                id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
                name: z.ZodString;
                fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                guards: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    condition: z.ZodString;
                    assignments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
                }, z.core.$strict>>>;
                type: z.ZodLiteral<"director">;
            }, z.core.$strict>], "type">>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
            config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strict>>;
        checkpoints: z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            name: z.ZodString;
            after: z.ZodOptional<z.ZodString>;
            contract: z.ZodOptional<z.ZodString>;
            resumeStrategy: z.ZodEnum<{
                "last-checkpoint": "last-checkpoint";
                "latest-plan": "latest-plan";
                explicit: "explicit";
            }>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, z.core.$strict>>;
        selfReviews: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            perspective: z.ZodOptional<z.ZodString>;
            criteria: z.ZodArray<z.ZodString>;
            required: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>>;
        researchSteps: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.core.$ZodBranded<z.ZodString, "Id", "out">;
            topic: z.ZodString;
            depth: z.ZodDefault<z.ZodEnum<{
                xhigh: "xhigh";
                shallow: "shallow";
                deep: "deep";
            }>>;
            sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>>;
        resumeOnRestart: z.ZodDefault<z.ZodBoolean>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strict>;
    version: z.ZodDefault<z.ZodString>;
    generatedAt: z.ZodString;
    sourceFile: z.ZodString;
    kind: z.ZodLiteral<"plan">;
}, z.core.$strict>], "kind">;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type SelfReview = z.infer<typeof SelfReviewSchema>;
export type ResearchStep = z.infer<typeof ResearchStepSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type Eval = z.infer<typeof EvalSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Guard = z.infer<typeof GuardSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Director = z.infer<typeof DirectorSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Lane = z.infer<typeof LaneSchema>;
export type AutonomousSession = z.infer<typeof AutonomousSessionSchema>;
export type VibePlan = z.infer<typeof VibePlanSchema>;
export type ResolverOutput = z.infer<typeof ResolverOutputSchema>;
export declare const parseResolverOutput: (raw: unknown) => ResolverOutput;
//# sourceMappingURL=schemas.d.ts.map