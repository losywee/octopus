import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';

export type PublicModelAlias = {
    id: number;
    public_model_id: number;
    alias: string;
    created_at?: string;
};

export type PublicModel = {
    id: number;
    name: string;
    enabled: boolean;
    note?: string;
    aliases?: PublicModelAlias[];
    created_at?: string;
    updated_at?: string;
};

export type PublicModelResolveResult = {
    upstream: string;
    public: string;
    via: string;
};

export type PublicModelPendingItem = {
    upstream: string;
    channel_id: number;
    channel_name: string;
    suggested_public?: string;
    via?: string;
};

export function usePublicModelList() {
    return useQuery({
        queryKey: ['public-models', 'list'],
        queryFn: async () => apiClient.get<PublicModel[]>('/api/v1/public-models'),
    });
}

export function useCreatePublicModel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { name: string; note?: string; enabled?: boolean; aliases?: string[] }) =>
            apiClient.post<PublicModel>('/api/v1/public-models', payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['public-models'] });
            qc.invalidateQueries({ queryKey: ['public-models', 'pending'] });
            qc.invalidateQueries({ queryKey: ['groups', 'list'] });
        },
    });
}

export function useUpdatePublicModel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { id: number; name?: string; note?: string; enabled?: boolean; aliases?: string[] }) =>
            apiClient.put<PublicModel>(`/api/v1/public-models/${payload.id}`, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['public-models'] });
            qc.invalidateQueries({ queryKey: ['public-models', 'pending'] });
            qc.invalidateQueries({ queryKey: ['groups', 'list'] });
        },
    });
}

export function useDeletePublicModel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => apiClient.delete(`/api/v1/public-models/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['public-models'] });
            qc.invalidateQueries({ queryKey: ['public-models', 'pending'] });
        },
    });
}

export function useResolvePublicModels() {
    return useMutation({
        mutationFn: async (upstreams: string[]) =>
            apiClient.post<PublicModelResolveResult[]>('/api/v1/public-models/resolve', { upstreams }),
    });
}

export function usePublicModelPending(enabled = true) {
    return useQuery({
        queryKey: ['public-models', 'pending'],
        queryFn: async () => apiClient.get<PublicModelPendingItem[]>('/api/v1/public-models/pending'),
        enabled,
    });
}

export function useSeedPublicModels() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => apiClient.post<{ created: number }>('/api/v1/public-models/seed', {}),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['public-models'] });
            qc.invalidateQueries({ queryKey: ['public-models', 'pending'] });
        },
    });
}

export function useAssignPublicModelAlias() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { public: string; alias: string }) =>
            apiClient.post<PublicModel>('/api/v1/public-models/assign', payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['public-models'] });
            qc.invalidateQueries({ queryKey: ['public-models', 'pending'] });
            qc.invalidateQueries({ queryKey: ['groups', 'list'] });
        },
    });
}

export type PublicModelImportItem = {
    name: string;
    note?: string;
    aliases?: string[];
    enabled?: boolean;
};

export type PublicModelImportResult = {
    created: number;
    updated: number;
    skipped: number;
};

export function useExportPublicModels() {
    return useMutation({
        mutationFn: async () => apiClient.get<PublicModelImportItem[]>('/api/v1/public-models/export'),
    });
}

export function useImportPublicModels() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (items: PublicModelImportItem[]) =>
            apiClient.post<PublicModelImportResult>('/api/v1/public-models/import', { items }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['public-models'] });
            qc.invalidateQueries({ queryKey: ['public-models', 'pending'] });
        },
    });
}
