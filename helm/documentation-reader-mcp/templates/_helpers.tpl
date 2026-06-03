{{/*
Expand the name of the chart.
*/}}
{{- define "documentation-reader-mcp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
Truncate at 63 chars because Kubernetes name fields are limited to this length.
*/}}
{{- define "documentation-reader-mcp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "documentation-reader-mcp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "documentation-reader-mcp.labels" -}}
helm.sh/chart: {{ include "documentation-reader-mcp.chart" . }}
{{ include "documentation-reader-mcp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "documentation-reader-mcp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "documentation-reader-mcp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "documentation-reader-mcp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "documentation-reader-mcp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the Secret that holds credentials.
Returns the existingSecret name when provided, otherwise the chart-managed secret name.
*/}}
{{- define "documentation-reader-mcp.secretName" -}}
{{- if .Values.existingSecret }}
{{- .Values.existingSecret }}
{{- else }}
{{- include "documentation-reader-mcp.fullname" . }}
{{- end }}
{{- end }}
