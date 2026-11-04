const jsonResponse = (schema: object, description = 'Success') => ({
  description,
  content: {
    'application/json': {
      schema,
    },
  },
});

const errorResponse = (description: string) =>
  jsonResponse({ $ref: '#/components/schemas/ErrorResponse' }, description);

const authorizationErrorResponses = {
  401: errorResponse('Missing or invalid session token'),
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Marks API',
    version: '1.0.0',
    description: 'Backend API used by the Marks app.',
  },
  tags: [{ name: 'Announcement' }, { name: 'Auth' }, { name: 'Infinite Campus' }],
  paths: {
    '/announcement': {
      get: {
        tags: ['Announcement'],
        summary: 'Get the current announcement',
        parameters: [
          {
            name: 'version',
            in: 'query',
            description: 'Installed app version used to suppress stale release announcements.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse({
            oneOf: [{ $ref: '#/components/schemas/Announcement' }, { type: 'null' }],
          }),
        },
      },
    },
    '/auth': {
      get: {
        tags: ['Auth'],
        summary: 'Check the auth router',
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/MessageResponse' }),
        },
      },
    },
    '/auth/districts': {
      get: {
        tags: ['Auth'],
        summary: 'Search Infinite Campus districts',
        parameters: [
          {
            name: 'state',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'query',
            in: 'query',
            required: true,
            description: 'District search text. Must be at least three characters.',
            schema: { type: 'string', minLength: 3 },
          },
        ],
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/UpstreamDataResponse' }),
          400: errorResponse('Missing or invalid search query'),
          502: errorResponse('Infinite Campus district search failed'),
        },
      },
    },
    '/auth/verify-session': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh and verify an existing session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerifySessionRequest' },
            },
          },
        },
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/SessionResponse' }),
          401: errorResponse('Session token cannot be verified'),
        },
      },
    },
    '/auth/web-pair/start': {
      post: {
        tags: ['Auth'],
        summary: 'Start a short-lived web pairing attempt',
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/WebPairStartResponse' }),
          500: errorResponse('The pairing attempt cannot be created'),
        },
      },
    },
    '/auth/web-pair/approve': {
      post: {
        tags: ['Auth'],
        summary: 'Approve a pending web pairing attempt from mobile',
        security: [{ sessionToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebPairApprovalRequest' },
            },
          },
        },
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/OkResponse' }),
          400: errorResponse('The approval payload is invalid'),
          401: errorResponse('The mobile session token is missing or invalid'),
          409: errorResponse('The pairing attempt is invalid or expired'),
        },
      },
    },
    '/auth/web-pair/complete': {
      post: {
        tags: ['Auth'],
        summary: 'Poll and complete a web pairing attempt',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebPairCompletionRequest' },
            },
          },
        },
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/WebPairCompleteResponse' }),
          202: jsonResponse({ $ref: '#/components/schemas/WebPairPendingResponse' }),
          400: errorResponse('The completion payload is invalid'),
          404: errorResponse('The pairing attempt cannot be found'),
          409: errorResponse('The pairing attempt was already used'),
          410: errorResponse('The pairing attempt expired'),
        },
      },
    },
    '/auth/web-session/sign-out': {
      post: {
        tags: ['Auth'],
        summary: 'Clear the web session cookie',
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/OkResponse' }),
        },
      },
    },
    '/auth/updateDevice': {
      post: {
        tags: ['Auth'],
        summary: 'Create a session from Infinite Campus login cookies',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateDeviceRequest' },
            },
          },
        },
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/UpdateDeviceResponse' }),
          401: errorResponse('Login data cannot be verified'),
        },
      },
    },
    '/ic/user': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get the current user account',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/JsonObject' }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/user/profile': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get profile summary data',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/UserProfile' }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/user/appList': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get available Infinite Campus apps',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        responses: {
          200: jsonResponse({
            type: 'array',
            items: { $ref: '#/components/schemas/JsonObject' },
          }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/responsiveSchedule': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get responsive schedule sessions',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        parameters: [
          {
            name: 'sectionID',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'calendarID',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'structureID',
            in: 'query',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse({
            type: 'array',
            items: { $ref: '#/components/schemas/JsonObject' },
          }),
          400: errorResponse('Required schedule parameters are missing'),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/responsiveSchedule/update': {
      post: {
        tags: ['Infinite Campus'],
        summary: 'Update a responsive schedule selection',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        parameters: [
          {
            name: 'responsiveOfferingID',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'calendarID',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'responsiveSessionID',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/MessageResponse' }),
          400: errorResponse('The schedule selection was rejected'),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/courseGrades': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get course grade summaries',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        parameters: [
          {
            name: 'termID',
            in: 'query',
            schema: { type: 'string' },
          },
          {
            name: 'taskID',
            in: 'query',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse({
            type: 'array',
            items: { $ref: '#/components/schemas/JsonObject' },
          }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/courseGrades/overview': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get courses and explicit grade/assignment availability',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        parameters: [
          { name: 'termID', in: 'query', schema: { type: 'string' } },
          { name: 'taskID', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: jsonResponse({
            type: 'object',
            properties: {
              courses: { type: 'array', items: { $ref: '#/components/schemas/JsonObject' } },
              availability: {
                type: 'object',
                properties: {
                  gradesEnabled: { type: ['boolean', 'null'] },
                  assignmentsEnabled: { type: ['boolean', 'null'] },
                },
              },
              assignmentFallbackAllowed: { type: 'boolean' },
            },
          }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/courseGrades/terms': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get available course grade terms',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        responses: {
          200: jsonResponse({
            type: 'array',
            items: { $ref: '#/components/schemas/JsonObject' },
          }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/courseGrades/{sectionID}': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get grade detail for a course section',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        parameters: [
          { $ref: '#/components/parameters/SectionID' },
          {
            name: 'termID',
            in: 'query',
            schema: { type: 'string' },
          },
          {
            name: 'taskID',
            in: 'query',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/CourseGradeDetail' }),
          404: errorResponse('No grade detail was found'),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/assignments': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get assignments',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        responses: {
          200: jsonResponse({
            type: 'array',
            items: { $ref: '#/components/schemas/JsonObject' },
          }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/assignments/{objectSectionID}': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get assignment detail',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        parameters: [
          {
            name: 'objectSectionID',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/JsonObject' }),
          ...authorizationErrorResponses,
        },
      },
    },
    '/ic/attendance/{enrollmentID}': {
      get: {
        tags: ['Infinite Campus'],
        summary: 'Get attendance totals',
        security: [{ sessionToken: [] }, { webSessionCookie: [] }],
        parameters: [
          {
            name: 'enrollmentID',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse({ $ref: '#/components/schemas/AttendanceSummary' }),
          ...authorizationErrorResponses,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionToken: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Sealed Marks session token returned by the auth endpoints.',
      },
      webSessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: '__Host-marks-session',
        description: 'HttpOnly sealed Marks session token set by web pairing.',
      },
    },
    parameters: {
      SectionID: {
        name: 'sectionID',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    },
    schemas: {
      JsonObject: {
        type: 'object',
        additionalProperties: true,
      },
      OkResponse: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean', const: true },
        },
      },
      MessageResponse: {
        type: 'object',
        required: ['ok', 'message'],
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['message'],
        properties: {
          ok: { type: 'boolean', const: false },
          message: { type: 'string' },
        },
      },
      UpstreamDataResponse: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean', const: true },
          data: {},
        },
      },
      SessionResponse: {
        type: 'object',
        required: ['ok', 'uuid', 'sessionToken'],
        properties: {
          ok: { type: 'boolean', const: true },
          uuid: { type: 'string' },
          sessionToken: { type: 'string' },
        },
      },
      VerifySessionRequest: {
        type: 'object',
        required: ['sessionToken'],
        properties: {
          sessionToken: { type: 'string' },
        },
      },
      WebPairStartResponse: {
        type: 'object',
        required: ['ok', 'attemptId', 'approvalToken', 'completionToken', 'expiresAt'],
        properties: {
          ok: { type: 'boolean', const: true },
          attemptId: { type: 'string', format: 'uuid' },
          approvalToken: { type: 'string' },
          completionToken: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      WebPairApprovalRequest: {
        type: 'object',
        required: ['attemptId', 'approvalToken'],
        properties: {
          attemptId: { type: 'string', format: 'uuid' },
          approvalToken: { type: 'string' },
        },
      },
      WebPairCompletionRequest: {
        type: 'object',
        required: ['attemptId', 'completionToken'],
        properties: {
          attemptId: { type: 'string', format: 'uuid' },
          completionToken: { type: 'string' },
        },
      },
      WebPairPendingResponse: {
        type: 'object',
        required: ['ok', 'status'],
        properties: {
          ok: { type: 'boolean', const: true },
          status: { type: 'string', const: 'pending' },
        },
      },
      WebPairCompleteResponse: {
        type: 'object',
        required: ['ok', 'status'],
        properties: {
          ok: { type: 'boolean', const: true },
          status: { type: 'string', const: 'paired' },
        },
      },
      UpdateDeviceRequest: {
        type: 'object',
        required: [
          'cookieHeader',
          'deviceType',
          'deviceModel',
          'systemVersion',
          'deviceID',
          'districtURL',
        ],
        properties: {
          cookieHeader: { type: 'string' },
          deviceType: { type: 'string' },
          deviceModel: { type: 'string' },
          systemVersion: { type: 'string' },
          deviceID: { type: 'string' },
          districtURL: { type: 'string' },
        },
      },
      UpdateDeviceResponse: {
        type: 'object',
        required: ['ok', 'data', 'uuid', 'sessionToken'],
        properties: {
          ok: { type: 'boolean', const: true },
          data: {},
          uuid: { type: 'string' },
          sessionToken: { type: 'string' },
        },
      },
      Announcement: {
        type: 'object',
        required: ['id', 'title', 'message', 'kind', 'dismissible'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          message: { type: 'string' },
          kind: { type: 'string' },
          ctaLabel: { type: 'string' },
          ctaUrl: { type: 'string', format: 'uri' },
          dismissible: { type: 'boolean' },
        },
      },
      UserProfile: {
        type: 'object',
        required: ['gpa', 'absences', 'tardies'],
        properties: {
          gpa: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  uw: { type: ['string', 'null'] },
                  w: { type: ['string', 'null'] },
                },
              },
              { type: 'null' },
            ],
          },
          absences: { type: ['integer', 'null'] },
          tardies: { type: ['integer', 'null'] },
        },
      },
      CourseGradeDetail: {
        type: 'object',
        required: ['task', 'categories'],
        properties: {
          task: { $ref: '#/components/schemas/JsonObject' },
          categories: {
            type: 'array',
            items: { $ref: '#/components/schemas/JsonObject' },
          },
        },
      },
      AttendanceSummary: {
        type: 'object',
        required: ['absences', 'tardies'],
        properties: {
          absences: { type: 'integer' },
          tardies: { type: 'integer' },
        },
      },
    },
  },
} as const;
