/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TranscriptsController } from './../controller/transcriptsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SlideTemplateController } from './../controller/slideTemplateController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SessionController } from './../controller/sessionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PublicPresentationController } from './../controller/publicPresentationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProjectsModelController } from './../controller/projectsModelController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PresentationController } from './../controller/presentationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { JiraController } from './../controller/jiraController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { IntegrationController } from './../controller/integrationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthckeckController } from './../controller/healthcheckController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ContextController } from './../controller/contextController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ChatController } from './../controller/chatController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AudioController } from './../controller/audioController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AccountController } from './../controller/accountController';
import { expressAuthentication } from './../middleware/authMiddleware';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';
const multer = require('multer');


const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "_36_Enums.TranscriptSource": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["MANUAL"]},{"dataType":"enum","enums":["RECORDING"]},{"dataType":"enum","enums":["UPLOAD"]},{"dataType":"enum","enums":["IMPORTED"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TranscriptSource": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.TranscriptSource","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonValue": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"double"},{"dataType":"boolean"},{"ref":"JsonObject"},{"ref":"JsonArray"},{"dataType":"enum","enums":[null]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonObject": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"ref":"JsonValue"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JsonArray": {
        "dataType": "refObject",
        "properties": {
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StandaloneTranscriptResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "projectId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "userId": {"dataType":"string","required":true},
            "title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "source": {"ref":"TranscriptSource","required":true},
            "language": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "transcript": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "recordedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"JsonValue"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StandaloneTranscriptListResponse": {
        "dataType": "refObject",
        "properties": {
            "transcripts": {"dataType":"array","array":{"dataType":"refObject","ref":"StandaloneTranscriptResponse"},"required":true},
            "total": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_StandaloneTranscriptListResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"StandaloneTranscriptListResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_StandaloneTranscriptResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"StandaloneTranscriptResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InputJsonValue": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"double"},{"dataType":"boolean"},{"ref":"InputJsonObject"},{"ref":"InputJsonArray"},{"dataType":"nestedObjectLiteral","nestedProperties":{}}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InputJsonObject": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"ref":"InputJsonValue"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InputJsonArray": {
        "dataType": "refObject",
        "properties": {
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTranscriptInput": {
        "dataType": "refObject",
        "properties": {
            "projectId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "source": {"ref":"TranscriptSource"},
            "content": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "language": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "recordedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateTranscriptInput": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "source": {"ref":"TranscriptSource"},
            "language": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "transcript": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
            "recordedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse__success-boolean__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"success":{"dataType":"boolean","required":true}}},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SlideTypeConfigResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "templateId": {"dataType":"string","required":true},
            "slideTypeKey": {"dataType":"string","required":true},
            "displayName": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "parametersSchema": {"dataType":"any","required":true},
            "position": {"dataType":"double","required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SlideTemplateResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "primaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "secondaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "backgroundColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "headingFont": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "bodyFont": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "logoUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "slideTypes": {"dataType":"array","array":{"dataType":"refObject","ref":"SlideTypeConfigResponse"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SlideTypeConfigInput": {
        "dataType": "refObject",
        "properties": {
            "slideTypeKey": {"dataType":"string","required":true},
            "displayName": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "parametersSchema": {"ref":"JsonValue","required":true},
            "position": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTemplateRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "primaryColor": {"dataType":"string"},
            "secondaryColor": {"dataType":"string"},
            "backgroundColor": {"dataType":"string"},
            "headingFont": {"dataType":"string"},
            "bodyFont": {"dataType":"string"},
            "logoUrl": {"dataType":"string"},
            "slideTypes": {"dataType":"array","array":{"dataType":"refObject","ref":"SlideTypeConfigInput"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateTemplateRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "description": {"dataType":"string"},
            "primaryColor": {"dataType":"string"},
            "secondaryColor": {"dataType":"string"},
            "backgroundColor": {"dataType":"string"},
            "headingFont": {"dataType":"string"},
            "bodyFont": {"dataType":"string"},
            "logoUrl": {"dataType":"string"},
            "slideTypes": {"dataType":"array","array":{"dataType":"refObject","ref":"SlideTypeConfigInput"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.Role": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ADMIN"]},{"dataType":"enum","enums":["CLIENT"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Role": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.Role","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "firebaseUid": {"dataType":"string","required":true},
            "email": {"dataType":"string","required":true},
            "name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "avatarUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "googleId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "isGoogleAccount": {"dataType":"boolean","required":true},
            "role": {"ref":"Role","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_UserResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"UserResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GenericResponse": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse__customToken-string__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"customToken":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DefaultSelection_Prisma._36_PresentationPayload_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"updatedAt":{"dataType":"datetime","required":true},"createdAt":{"dataType":"datetime","required":true},"status":{"dataType":"string","required":true},"contextIds":{"dataType":"array","array":{"dataType":"string"},"required":true},"slidesJson":{"ref":"JsonValue","required":true},"title":{"dataType":"string","required":true},"templateId":{"dataType":"string","required":true},"userId":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicPresentationResponse": {
        "dataType": "refObject",
        "properties": {
            "updatedAt": {"dataType":"datetime","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "status": {"dataType":"string","required":true},
            "contextIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "slidesJson": {"ref":"JsonValue","required":true},
            "title": {"dataType":"string","required":true},
            "templateId": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.ProjectStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ACTIVE"]},{"dataType":"enum","enums":["COMPLETED"]},{"dataType":"enum","enums":["ARCHIVED"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProjectStatus": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.ProjectStatus","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProjectResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "status": {"ref":"ProjectStatus","required":true},
            "startedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "endedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"JsonValue"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProjectListResponse": {
        "dataType": "refObject",
        "properties": {
            "projects": {"dataType":"array","array":{"dataType":"refObject","ref":"ProjectResponse"},"required":true},
            "total": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_ProjectListResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"ProjectListResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TranscriptResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "projectId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "userId": {"dataType":"string","required":true},
            "title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "source": {"ref":"TranscriptSource","required":true},
            "language": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "transcript": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "recordedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"JsonValue"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.TaskStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["COMPLETED"]},{"dataType":"enum","enums":["ARCHIVED"]},{"dataType":"enum","enums":["BACKLOG"]},{"dataType":"enum","enums":["IN_PROGRESS"]},{"dataType":"enum","enums":["BLOCKED"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TaskStatus": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.TaskStatus","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.TaskPriority": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["LOW"]},{"dataType":"enum","enums":["MEDIUM"]},{"dataType":"enum","enums":["HIGH"]},{"dataType":"enum","enums":["URGENT"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TaskPriority": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.TaskPriority","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TaskResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "projectId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "acceptanceCriteria": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "status": {"ref":"TaskStatus","required":true},
            "priority": {"ref":"TaskPriority","required":true},
            "dueDate": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "dependencies": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TranscriptTaskInsight": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "priority": {"ref":"TaskPriority"},
            "status": {"ref":"TaskStatus"},
            "dueDate": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TranscriptAnalysisResponse": {
        "dataType": "refObject",
        "properties": {
            "language": {"dataType":"string","required":true},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "tasks": {"dataType":"array","array":{"dataType":"refObject","ref":"TranscriptTaskInsight"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTranscriptResponse": {
        "dataType": "refObject",
        "properties": {
            "transcript": {"ref":"TranscriptResponse","required":true},
            "tasks": {"dataType":"array","array":{"dataType":"refObject","ref":"TaskResponse"},"required":true},
            "analysis": {"ref":"TranscriptAnalysisResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_CreateTranscriptResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"CreateTranscriptResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TranscriptListResponse": {
        "dataType": "refObject",
        "properties": {
            "transcripts": {"dataType":"array","array":{"dataType":"refObject","ref":"TranscriptResponse"},"required":true},
            "total": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_TranscriptListResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"TranscriptListResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_TranscriptResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"TranscriptResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ManualTranscriptRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "source": {"ref":"TranscriptSource"},
            "language": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "content": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "recordedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateTranscriptRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "source": {"ref":"TranscriptSource"},
            "language": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "transcript": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "recordedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_null_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":[null]},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TaskListResponse": {
        "dataType": "refObject",
        "properties": {
            "tasks": {"dataType":"array","array":{"dataType":"refObject","ref":"TaskResponse"},"required":true},
            "total": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_TaskListResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"TaskListResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_TaskResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"TaskResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTaskRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "acceptanceCriteria": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "status": {"ref":"TaskStatus"},
            "priority": {"ref":"TaskPriority"},
            "dueDate": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
            "dependencyTaskIds": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateTaskRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "summary": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "acceptanceCriteria": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "status": {"ref":"TaskStatus"},
            "priority": {"ref":"TaskPriority"},
            "dueDate": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
            "dependencyTaskIds": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_ProjectResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"ProjectResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateProjectRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "status": {"ref":"ProjectStatus"},
            "startedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateProjectRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "status": {"ref":"ProjectStatus"},
            "startedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "endedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTranscriptRequest": {
        "dataType": "refObject",
        "properties": {
            "content": {"dataType":"string"},
            "objective": {"dataType":"string"},
            "title": {"dataType":"string"},
            "source": {"ref":"TranscriptSource"},
            "recordedAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
            "contextIds": {"dataType":"array","array":{"dataType":"string"}},
            "persona": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["SECRETARY"]},{"dataType":"enum","enums":["ARCHITECT"]},{"dataType":"enum","enums":["PRODUCT_MANAGER"]},{"dataType":"enum","enums":["DEVELOPER"]}]},
            "englishLevel": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TemplateSubset": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "primaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "secondaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "backgroundColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "headingFont": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "bodyFont": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "logoUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PresentationResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "templateId": {"dataType":"string","required":true},
            "template": {"ref":"TemplateSubset"},
            "title": {"dataType":"string","required":true},
            "slidesJson": {"dataType":"any","required":true},
            "contextIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "status": {"dataType":"string","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GeneratePresentationRequest": {
        "dataType": "refObject",
        "properties": {
            "templateId": {"dataType":"string","required":true},
            "contextIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "prompt": {"dataType":"string","required":true},
            "title": {"dataType":"string"},
            "numSlides": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdatePresentationRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "status": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdatePresentationStatusRequest": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JiraAuthorizationResponse": {
        "dataType": "refObject",
        "properties": {
            "authorizationUrl": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_JiraAuthorizationResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"JiraAuthorizationResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.IntegrationProvider": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["JIRA"]},{"dataType":"enum","enums":["LINEAR"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IntegrationProvider": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.IntegrationProvider","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.IntegrationStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["CONNECTED"]},{"dataType":"enum","enums":["DISCONNECTED"]},{"dataType":"enum","enums":["ERROR"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IntegrationStatus": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.IntegrationStatus","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserIntegrationSummary": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "provider": {"ref":"IntegrationProvider","required":true},
            "status": {"ref":"IntegrationStatus","required":true},
            "accountId": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "accountName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"JsonValue"},{"dataType":"enum","enums":[null]}],"required":true},
            "scope": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "expiresAt": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}],"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "hasRefreshToken": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_UserIntegrationSummary-Array_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"refObject","ref":"UserIntegrationSummary"}},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_UserIntegrationSummary-or-null_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"union","subSchemas":[{"ref":"UserIntegrationSummary"},{"dataType":"enum","enums":[null]}]},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContextFileResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "fileName": {"dataType":"string","required":true},
            "mimeType": {"dataType":"string","required":true},
            "sizeBytes": {"dataType":"double","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "bucketPath": {"dataType":"string","required":true},
            "publicUrl": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContextResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "color": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"JsonValue"},{"dataType":"enum","enums":[null]}],"required":true},
            "files": {"dataType":"array","array":{"dataType":"refObject","ref":"ContextFileResponse"},"required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContextListResponse": {
        "dataType": "refObject",
        "properties": {
            "contexts": {"dataType":"array","array":{"dataType":"refObject","ref":"ContextResponse"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_ContextListResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"ContextListResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_ContextResponse_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"ContextResponse"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateContextRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "color": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateContextRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "color": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "metadata": {"dataType":"union","subSchemas":[{"ref":"InputJsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.ChatRole": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["USER"]},{"dataType":"enum","enums":["ASSISTANT"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChatRole": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.ChatRole","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChatMessage": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "threadId": {"dataType":"string","required":true},
            "role": {"ref":"ChatRole","required":true},
            "content": {"dataType":"string","required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChatThread": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "userId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "contextIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "englishLevel": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "createdAt": {"dataType":"datetime","required":true},
            "updatedAt": {"dataType":"datetime","required":true},
            "messages": {"dataType":"array","array":{"dataType":"refObject","ref":"ChatMessage"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateThreadRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "contextIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "englishLevel": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SendMessageResponse": {
        "dataType": "refObject",
        "properties": {
            "message": {"ref":"ChatMessage","required":true},
            "response": {"ref":"ChatMessage","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SendMessageRequest": {
        "dataType": "refObject",
        "properties": {
            "content": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse__text-string__": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"text":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DefaultSelection_Prisma._36_CustomThemePayload_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"configJson":{"ref":"JsonValue","required":true},"density":{"dataType":"double","required":true},"borderRadius":{"dataType":"double","required":true},"headingFontFamily":{"dataType":"string","required":true},"fontFamily":{"dataType":"string","required":true},"textSecondaryColor":{"dataType":"string","required":true},"textPrimaryColor":{"dataType":"string","required":true},"surfaceColor":{"dataType":"string","required":true},"backgroundColor":{"dataType":"string","required":true},"secondaryColor":{"dataType":"string","required":true},"primaryColor":{"dataType":"string","required":true},"updatedAt":{"dataType":"datetime","required":true},"createdAt":{"dataType":"datetime","required":true},"userId":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomTheme": {
        "dataType": "refAlias",
        "type": {"ref":"DefaultSelection_Prisma._36_CustomThemePayload_","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_CustomTheme-or-null_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"union","subSchemas":[{"ref":"CustomTheme"},{"dataType":"enum","enums":[null]}]},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_CustomTheme_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"ref":"CustomTheme"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateCustomThemeRequest": {
        "dataType": "refObject",
        "properties": {
            "primaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "secondaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "backgroundColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "surfaceColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "textPrimaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "textSecondaryColor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "fontFamily": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "headingFontFamily": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "borderRadius": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "density": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "configJson": {"dataType":"union","subSchemas":[{"ref":"JsonValue"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiResponse_boolean_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string"},"data":{"dataType":"union","subSchemas":[{"dataType":"boolean"},{"dataType":"enum","enums":[null]}],"required":true},"status":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router,opts?:{multer?:ReturnType<typeof multer>}) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################

    const upload = opts?.multer ||  multer({"limits":{"fileSize":8388608}});

    
        const argsTranscriptsController_listTranscripts: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                pageSize: {"default":20,"in":"query","name":"pageSize","dataType":"double"},
                source: {"in":"query","name":"source","ref":"TranscriptSource"},
        };
        app.get('/api/transcripts',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController)),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController.prototype.listTranscripts)),

            async function TranscriptsController_listTranscripts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTranscriptsController_listTranscripts, request, response });

                const controller = new TranscriptsController();

              await templateService.apiHandler({
                methodName: 'listTranscripts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTranscriptsController_createTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateTranscriptInput"},
        };
        app.post('/api/transcripts',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController)),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController.prototype.createTranscript)),

            async function TranscriptsController_createTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTranscriptsController_createTranscript, request, response });

                const controller = new TranscriptsController();

              await templateService.apiHandler({
                methodName: 'createTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTranscriptsController_getTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/api/transcripts/:id',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController)),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController.prototype.getTranscript)),

            async function TranscriptsController_getTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTranscriptsController_getTranscript, request, response });

                const controller = new TranscriptsController();

              await templateService.apiHandler({
                methodName: 'getTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTranscriptsController_updateTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateTranscriptInput"},
        };
        app.put('/api/transcripts/:id',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController)),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController.prototype.updateTranscript)),

            async function TranscriptsController_updateTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTranscriptsController_updateTranscript, request, response });

                const controller = new TranscriptsController();

              await templateService.apiHandler({
                methodName: 'updateTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTranscriptsController_deleteTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.delete('/api/transcripts/:id',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController)),
            ...(fetchMiddlewares<RequestHandler>(TranscriptsController.prototype.deleteTranscript)),

            async function TranscriptsController_deleteTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTranscriptsController_deleteTranscript, request, response });

                const controller = new TranscriptsController();

              await templateService.apiHandler({
                methodName: 'deleteTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSlideTemplateController_listTemplates: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/slide-templates',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController.prototype.listTemplates)),

            async function SlideTemplateController_listTemplates(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSlideTemplateController_listTemplates, request, response });

                const controller = new SlideTemplateController();

              await templateService.apiHandler({
                methodName: 'listTemplates',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSlideTemplateController_getTemplate: Record<string, TsoaRoute.ParameterSchema> = {
                templateId: {"in":"path","name":"templateId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/slide-templates/:templateId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController.prototype.getTemplate)),

            async function SlideTemplateController_getTemplate(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSlideTemplateController_getTemplate, request, response });

                const controller = new SlideTemplateController();

              await templateService.apiHandler({
                methodName: 'getTemplate',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSlideTemplateController_createTemplate: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateTemplateRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/slide-templates',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController.prototype.createTemplate)),

            async function SlideTemplateController_createTemplate(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSlideTemplateController_createTemplate, request, response });

                const controller = new SlideTemplateController();

              await templateService.apiHandler({
                methodName: 'createTemplate',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSlideTemplateController_updateTemplate: Record<string, TsoaRoute.ParameterSchema> = {
                templateId: {"in":"path","name":"templateId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateTemplateRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/slide-templates/:templateId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController.prototype.updateTemplate)),

            async function SlideTemplateController_updateTemplate(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSlideTemplateController_updateTemplate, request, response });

                const controller = new SlideTemplateController();

              await templateService.apiHandler({
                methodName: 'updateTemplate',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSlideTemplateController_deleteTemplate: Record<string, TsoaRoute.ParameterSchema> = {
                templateId: {"in":"path","name":"templateId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/slide-templates/:templateId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController)),
            ...(fetchMiddlewares<RequestHandler>(SlideTemplateController.prototype.deleteTemplate)),

            async function SlideTemplateController_deleteTemplate(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSlideTemplateController_deleteTemplate, request, response });

                const controller = new SlideTemplateController();

              await templateService.apiHandler({
                methodName: 'deleteTemplate',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSessionController_login: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"token":{"dataType":"string","required":true},"uuid":{"dataType":"string","required":true}}},
        };
        app.post('/api/session/login',
            ...(fetchMiddlewares<RequestHandler>(SessionController)),
            ...(fetchMiddlewares<RequestHandler>(SessionController.prototype.login)),

            async function SessionController_login(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSessionController_login, request, response });

                const controller = new SessionController();

              await templateService.apiHandler({
                methodName: 'login',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSessionController_getCurrentUser: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/session/me',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SessionController)),
            ...(fetchMiddlewares<RequestHandler>(SessionController.prototype.getCurrentUser)),

            async function SessionController_getCurrentUser(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSessionController_getCurrentUser, request, response });

                const controller = new SessionController();

              await templateService.apiHandler({
                methodName: 'getCurrentUser',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSessionController_getDesktopToken: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/session/desktop-token',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SessionController)),
            ...(fetchMiddlewares<RequestHandler>(SessionController.prototype.getDesktopToken)),

            async function SessionController_getDesktopToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSessionController_getDesktopToken, request, response });

                const controller = new SessionController();

              await templateService.apiHandler({
                methodName: 'getDesktopToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPublicPresentationController_getPublicPresentation: Record<string, TsoaRoute.ParameterSchema> = {
                presentationId: {"in":"path","name":"presentationId","required":true,"dataType":"string"},
        };
        app.get('/api/public/presentations/:presentationId',
            ...(fetchMiddlewares<RequestHandler>(PublicPresentationController)),
            ...(fetchMiddlewares<RequestHandler>(PublicPresentationController.prototype.getPublicPresentation)),

            async function PublicPresentationController_getPublicPresentation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPublicPresentationController_getPublicPresentation, request, response });

                const controller = new PublicPresentationController();

              await templateService.apiHandler({
                methodName: 'getPublicPresentation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_listSessions: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                pageSize: {"default":20,"in":"query","name":"pageSize","dataType":"double"},
                status: {"in":"query","name":"status","ref":"ProjectStatus"},
        };
        app.get('/api/projects',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.listSessions)),

            async function ProjectsModelController_listSessions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_listSessions, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'listSessions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_uploadTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                files: {"in":"formData","name":"files","required":true,"dataType":"array","array":{"dataType":"file"}},
                title: {"in":"formData","name":"title","dataType":"string"},
                recordedAt: {"in":"formData","name":"recordedAt","dataType":"string"},
                metadata: {"in":"formData","name":"metadata","dataType":"string"},
                persona: {"in":"formData","name":"persona","dataType":"string"},
                objective: {"in":"formData","name":"objective","dataType":"string"},
                contextIds: {"in":"formData","name":"contextIds","dataType":"string"},
                englishLevel: {"in":"formData","name":"englishLevel","dataType":"string"},
        };
        app.post('/api/projects/:projectId/transcripts/upload',
            authenticateMiddleware([{"ClientLevel":[]}]),
            upload.fields([
                {
                    name: "files",
                }
            ]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.uploadTranscript)),

            async function ProjectsModelController_uploadTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_uploadTranscript, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'uploadTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_listProjectTranscripts: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                pageSize: {"default":20,"in":"query","name":"pageSize","dataType":"double"},
        };
        app.get('/api/projects/:projectId/transcripts',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.listProjectTranscripts)),

            async function ProjectsModelController_listProjectTranscripts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_listProjectTranscripts, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'listProjectTranscripts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_getProjectTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                transcriptId: {"in":"path","name":"transcriptId","required":true,"dataType":"string"},
        };
        app.get('/api/projects/:projectId/transcripts/:transcriptId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.getProjectTranscript)),

            async function ProjectsModelController_getProjectTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_getProjectTranscript, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'getProjectTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_createManualTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ManualTranscriptRequest"},
        };
        app.post('/api/projects/:projectId/transcripts/manual',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.createManualTranscript)),

            async function ProjectsModelController_createManualTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_createManualTranscript, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'createManualTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_updateProjectTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                transcriptId: {"in":"path","name":"transcriptId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateTranscriptRequest"},
        };
        app.put('/api/projects/:projectId/transcripts/:transcriptId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.updateProjectTranscript)),

            async function ProjectsModelController_updateProjectTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_updateProjectTranscript, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'updateProjectTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_deleteProjectTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                transcriptId: {"in":"path","name":"transcriptId","required":true,"dataType":"string"},
        };
        app.delete('/api/projects/:projectId/transcripts/:transcriptId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.deleteProjectTranscript)),

            async function ProjectsModelController_deleteProjectTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_deleteProjectTranscript, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'deleteProjectTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_listTasks: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                status: {"in":"query","name":"status","ref":"TaskStatus"},
                priority: {"in":"query","name":"priority","ref":"TaskPriority"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                pageSize: {"default":20,"in":"query","name":"pageSize","dataType":"double"},
        };
        app.get('/api/projects/:projectId/tasks',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.listTasks)),

            async function ProjectsModelController_listTasks(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_listTasks, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'listTasks',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_getTask: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                taskId: {"in":"path","name":"taskId","required":true,"dataType":"string"},
        };
        app.get('/api/projects/:projectId/tasks/:taskId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.getTask)),

            async function ProjectsModelController_getTask(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_getTask, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'getTask',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_createTask: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateTaskRequest"},
        };
        app.post('/api/projects/:projectId/tasks',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.createTask)),

            async function ProjectsModelController_createTask(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_createTask, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'createTask',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_updateTask: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                taskId: {"in":"path","name":"taskId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateTaskRequest"},
        };
        app.put('/api/projects/:projectId/tasks/:taskId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.updateTask)),

            async function ProjectsModelController_updateTask(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_updateTask, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'updateTask',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_deleteTask: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                taskId: {"in":"path","name":"taskId","required":true,"dataType":"string"},
        };
        app.delete('/api/projects/:projectId/tasks/:taskId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.deleteTask)),

            async function ProjectsModelController_deleteTask(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_deleteTask, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'deleteTask',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_getSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
        };
        app.get('/api/projects/:projectId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.getSession)),

            async function ProjectsModelController_getSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_getSession, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'getSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_createSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateProjectRequest"},
        };
        app.post('/api/projects',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.createSession)),

            async function ProjectsModelController_createSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_createSession, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'createSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_updateSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateProjectRequest"},
        };
        app.put('/api/projects/:projectId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.updateSession)),

            async function ProjectsModelController_updateSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_updateSession, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'updateSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_deleteSession: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
        };
        app.delete('/api/projects/:projectId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.deleteSession)),

            async function ProjectsModelController_deleteSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_deleteSession, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'deleteSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProjectsModelController_createProjectTranscript: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                projectId: {"in":"path","name":"projectId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateTranscriptRequest"},
        };
        app.post('/api/projects/:projectId/transcripts',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController)),
            ...(fetchMiddlewares<RequestHandler>(ProjectsModelController.prototype.createProjectTranscript)),

            async function ProjectsModelController_createProjectTranscript(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProjectsModelController_createProjectTranscript, request, response });

                const controller = new ProjectsModelController();

              await templateService.apiHandler({
                methodName: 'createProjectTranscript',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPresentationController_generatePresentation: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"GeneratePresentationRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/presentations/generate',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PresentationController)),
            ...(fetchMiddlewares<RequestHandler>(PresentationController.prototype.generatePresentation)),

            async function PresentationController_generatePresentation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPresentationController_generatePresentation, request, response });

                const controller = new PresentationController();

              await templateService.apiHandler({
                methodName: 'generatePresentation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPresentationController_listPresentations: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/presentations',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PresentationController)),
            ...(fetchMiddlewares<RequestHandler>(PresentationController.prototype.listPresentations)),

            async function PresentationController_listPresentations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPresentationController_listPresentations, request, response });

                const controller = new PresentationController();

              await templateService.apiHandler({
                methodName: 'listPresentations',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPresentationController_getPresentation: Record<string, TsoaRoute.ParameterSchema> = {
                presentationId: {"in":"path","name":"presentationId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/presentations/:presentationId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PresentationController)),
            ...(fetchMiddlewares<RequestHandler>(PresentationController.prototype.getPresentation)),

            async function PresentationController_getPresentation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPresentationController_getPresentation, request, response });

                const controller = new PresentationController();

              await templateService.apiHandler({
                methodName: 'getPresentation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPresentationController_deletePresentation: Record<string, TsoaRoute.ParameterSchema> = {
                presentationId: {"in":"path","name":"presentationId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/presentations/:presentationId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PresentationController)),
            ...(fetchMiddlewares<RequestHandler>(PresentationController.prototype.deletePresentation)),

            async function PresentationController_deletePresentation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPresentationController_deletePresentation, request, response });

                const controller = new PresentationController();

              await templateService.apiHandler({
                methodName: 'deletePresentation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPresentationController_updatePresentation: Record<string, TsoaRoute.ParameterSchema> = {
                presentationId: {"in":"path","name":"presentationId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdatePresentationRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.patch('/api/presentations/:presentationId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PresentationController)),
            ...(fetchMiddlewares<RequestHandler>(PresentationController.prototype.updatePresentation)),

            async function PresentationController_updatePresentation(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPresentationController_updatePresentation, request, response });

                const controller = new PresentationController();

              await templateService.apiHandler({
                methodName: 'updatePresentation',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPresentationController_updatePresentationStatus: Record<string, TsoaRoute.ParameterSchema> = {
                presentationId: {"in":"path","name":"presentationId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdatePresentationStatusRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.patch('/api/presentations/:presentationId/status',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PresentationController)),
            ...(fetchMiddlewares<RequestHandler>(PresentationController.prototype.updatePresentationStatus)),

            async function PresentationController_updatePresentationStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPresentationController_updatePresentationStatus, request, response });

                const controller = new PresentationController();

              await templateService.apiHandler({
                methodName: 'updatePresentationStatus',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsJiraController_getAuthorizationUrl: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                state: {"in":"query","name":"state","dataType":"string"},
        };
        app.get('/api/jira/auth',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(JiraController)),
            ...(fetchMiddlewares<RequestHandler>(JiraController.prototype.getAuthorizationUrl)),

            async function JiraController_getAuthorizationUrl(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsJiraController_getAuthorizationUrl, request, response });

                const controller = new JiraController();

              await templateService.apiHandler({
                methodName: 'getAuthorizationUrl',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsJiraController_handleCallback: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                code: {"in":"query","name":"code","dataType":"string"},
                state: {"in":"query","name":"state","dataType":"string"},
                error: {"in":"query","name":"error","dataType":"string"},
                errorDescription: {"in":"query","name":"error_description","dataType":"string"},
        };
        app.get('/api/jira/callback',
            ...(fetchMiddlewares<RequestHandler>(JiraController)),
            ...(fetchMiddlewares<RequestHandler>(JiraController.prototype.handleCallback)),

            async function JiraController_handleCallback(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsJiraController_handleCallback, request, response });

                const controller = new JiraController();

              await templateService.apiHandler({
                methodName: 'handleCallback',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsIntegrationController_listIntegrations: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/integrations',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(IntegrationController)),
            ...(fetchMiddlewares<RequestHandler>(IntegrationController.prototype.listIntegrations)),

            async function IntegrationController_listIntegrations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsIntegrationController_listIntegrations, request, response });

                const controller = new IntegrationController();

              await templateService.apiHandler({
                methodName: 'listIntegrations',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsIntegrationController_getIntegration: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                provider: {"in":"path","name":"provider","required":true,"dataType":"string"},
        };
        app.get('/api/integrations/:provider',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(IntegrationController)),
            ...(fetchMiddlewares<RequestHandler>(IntegrationController.prototype.getIntegration)),

            async function IntegrationController_getIntegration(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsIntegrationController_getIntegration, request, response });

                const controller = new IntegrationController();

              await templateService.apiHandler({
                methodName: 'getIntegration',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsHealthckeckController_getStatusPayload: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/healthcheck/status',
            ...(fetchMiddlewares<RequestHandler>(HealthckeckController)),
            ...(fetchMiddlewares<RequestHandler>(HealthckeckController.prototype.getStatusPayload)),

            async function HealthckeckController_getStatusPayload(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsHealthckeckController_getStatusPayload, request, response });

                const controller = new HealthckeckController();

              await templateService.apiHandler({
                methodName: 'getStatusPayload',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_listContexts: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/contexts',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.listContexts)),

            async function ContextController_listContexts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_listContexts, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'listContexts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_createContext: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateContextRequest"},
        };
        app.post('/api/contexts',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.createContext)),

            async function ContextController_createContext(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_createContext, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'createContext',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_getContext: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                contextId: {"in":"path","name":"contextId","required":true,"dataType":"string"},
        };
        app.get('/api/contexts/:contextId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.getContext)),

            async function ContextController_getContext(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_getContext, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'getContext',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_getContextFileContent: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                contextId: {"in":"path","name":"contextId","required":true,"dataType":"string"},
                fileId: {"in":"path","name":"fileId","required":true,"dataType":"string"},
        };
        app.get('/api/contexts/:contextId/files/:fileId/content',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.getContextFileContent)),

            async function ContextController_getContextFileContent(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_getContextFileContent, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'getContextFileContent',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_updateContext: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                contextId: {"in":"path","name":"contextId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateContextRequest"},
        };
        app.put('/api/contexts/:contextId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.updateContext)),

            async function ContextController_updateContext(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_updateContext, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'updateContext',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_deleteContext: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                contextId: {"in":"path","name":"contextId","required":true,"dataType":"string"},
        };
        app.delete('/api/contexts/:contextId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.deleteContext)),

            async function ContextController_deleteContext(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_deleteContext, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'deleteContext',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_uploadContextFile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                contextId: {"in":"path","name":"contextId","required":true,"dataType":"string"},
                files: {"in":"formData","name":"files","required":true,"dataType":"array","array":{"dataType":"file"}},
                metadata: {"in":"query","name":"metadata","dataType":"string"},
        };
        app.post('/api/contexts/:contextId/files',
            authenticateMiddleware([{"ClientLevel":[]}]),
            upload.fields([
                {
                    name: "files",
                }
            ]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.uploadContextFile)),

            async function ContextController_uploadContextFile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_uploadContextFile, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'uploadContextFile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContextController_deleteContextFile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                contextId: {"in":"path","name":"contextId","required":true,"dataType":"string"},
                fileId: {"in":"path","name":"fileId","required":true,"dataType":"string"},
        };
        app.delete('/api/contexts/:contextId/files/:fileId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContextController)),
            ...(fetchMiddlewares<RequestHandler>(ContextController.prototype.deleteContextFile)),

            async function ContextController_deleteContextFile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContextController_deleteContextFile, request, response });

                const controller = new ContextController();

              await templateService.apiHandler({
                methodName: 'deleteContextFile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatController_listThreads: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/chat/threads',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatController)),
            ...(fetchMiddlewares<RequestHandler>(ChatController.prototype.listThreads)),

            async function ChatController_listThreads(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatController_listThreads, request, response });

                const controller = new ChatController();

              await templateService.apiHandler({
                methodName: 'listThreads',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatController_getThread: Record<string, TsoaRoute.ParameterSchema> = {
                threadId: {"in":"path","name":"threadId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/chat/threads/:threadId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatController)),
            ...(fetchMiddlewares<RequestHandler>(ChatController.prototype.getThread)),

            async function ChatController_getThread(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatController_getThread, request, response });

                const controller = new ChatController();

              await templateService.apiHandler({
                methodName: 'getThread',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatController_createThread: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateThreadRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/chat/threads',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatController)),
            ...(fetchMiddlewares<RequestHandler>(ChatController.prototype.createThread)),

            async function ChatController_createThread(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatController_createThread, request, response });

                const controller = new ChatController();

              await templateService.apiHandler({
                methodName: 'createThread',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatController_updateThread: Record<string, TsoaRoute.ParameterSchema> = {
                threadId: {"in":"path","name":"threadId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"englishLevel":{"dataType":"string"},"contextIds":{"dataType":"array","array":{"dataType":"string"}},"title":{"dataType":"string"}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/chat/threads/:threadId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatController)),
            ...(fetchMiddlewares<RequestHandler>(ChatController.prototype.updateThread)),

            async function ChatController_updateThread(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatController_updateThread, request, response });

                const controller = new ChatController();

              await templateService.apiHandler({
                methodName: 'updateThread',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatController_deleteThread: Record<string, TsoaRoute.ParameterSchema> = {
                threadId: {"in":"path","name":"threadId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/chat/threads/:threadId',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatController)),
            ...(fetchMiddlewares<RequestHandler>(ChatController.prototype.deleteThread)),

            async function ChatController_deleteThread(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatController_deleteThread, request, response });

                const controller = new ChatController();

              await templateService.apiHandler({
                methodName: 'deleteThread',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatController_sendMessage: Record<string, TsoaRoute.ParameterSchema> = {
                threadId: {"in":"path","name":"threadId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"SendMessageRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/chat/threads/:threadId/messages',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatController)),
            ...(fetchMiddlewares<RequestHandler>(ChatController.prototype.sendMessage)),

            async function ChatController_sendMessage(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatController_sendMessage, request, response });

                const controller = new ChatController();

              await templateService.apiHandler({
                methodName: 'sendMessage',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAudioController_transcribeChunk: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                micFile: {"in":"formData","name":"mic","dataType":"file"},
                sysFile: {"in":"formData","name":"system","dataType":"file"},
        };
        app.post('/api/audio/transcribe-chunk',
            authenticateMiddleware([{"ClientLevel":[]}]),
            upload.fields([
                {
                    name: "mic",
                    maxCount: 1
                },
                {
                    name: "system",
                    maxCount: 1
                }
            ]),
            ...(fetchMiddlewares<RequestHandler>(AudioController)),
            ...(fetchMiddlewares<RequestHandler>(AudioController.prototype.transcribeChunk)),

            async function AudioController_transcribeChunk(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAudioController_transcribeChunk, request, response });

                const controller = new AudioController();

              await templateService.apiHandler({
                methodName: 'transcribeChunk',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccountController_getCustomTheme: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/account/theme',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AccountController)),
            ...(fetchMiddlewares<RequestHandler>(AccountController.prototype.getCustomTheme)),

            async function AccountController_getCustomTheme(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccountController_getCustomTheme, request, response });

                const controller = new AccountController();

              await templateService.apiHandler({
                methodName: 'getCustomTheme',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccountController_upsertCustomTheme: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"UpdateCustomThemeRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/account/theme',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AccountController)),
            ...(fetchMiddlewares<RequestHandler>(AccountController.prototype.upsertCustomTheme)),

            async function AccountController_upsertCustomTheme(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccountController_upsertCustomTheme, request, response });

                const controller = new AccountController();

              await templateService.apiHandler({
                methodName: 'upsertCustomTheme',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccountController_deleteUser: Record<string, TsoaRoute.ParameterSchema> = {
                userId: {"in":"path","name":"userId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/account/user/:userId',
            authenticateMiddleware([{"AdminOnly":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AccountController)),
            ...(fetchMiddlewares<RequestHandler>(AccountController.prototype.deleteUser)),

            async function AccountController_deleteUser(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccountController_deleteUser, request, response });

                const controller = new AccountController();

              await templateService.apiHandler({
                methodName: 'deleteUser',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccountController_deleteMyAccount: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/account/self',
            authenticateMiddleware([{"ClientLevel":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AccountController)),
            ...(fetchMiddlewares<RequestHandler>(AccountController.prototype.deleteMyAccount)),

            async function AccountController_deleteMyAccount(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccountController_deleteMyAccount, request, response });

                const controller = new AccountController();

              await templateService.apiHandler({
                methodName: 'deleteMyAccount',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
        return async function runAuthenticationMiddleware(request: any, response: any, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            // keep track of failed auth attempts so we can hand back the most
            // recent one.  This behavior was previously existing so preserving it
            // here
            const failedAttempts: any[] = [];
            const pushAndRethrow = (error: any) => {
                failedAttempts.push(error);
                throw error;
            };

            const secMethodOrPromises: Promise<any>[] = [];
            for (const secMethod of security) {
                if (Object.keys(secMethod).length > 1) {
                    const secMethodAndPromises: Promise<any>[] = [];

                    for (const name in secMethod) {
                        secMethodAndPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }

                    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            try {
                request['user'] = await Promise.any(secMethodOrPromises);

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }

                next();
            }
            catch(err) {
                // Show most recent error as response
                const error = failedAttempts.pop();
                error.status = error.status || 401;

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }
                next(error);
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
