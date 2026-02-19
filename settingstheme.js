import { StyleSheet } from 'react-native';

export const settingsStyles = StyleSheet.create({
    page: { flex: 1, backgroundColor: '#f3f4f6' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: 'transparent',
    },
    headerTitle: { fontSize: 19, fontWeight: '700', color: '#111827' },
    headerSubtitle: {
        color: '#6b7280',
        marginTop: 2,
        fontSize: 13,
    },
    headerIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
    },

    sheet: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
        marginTop: 12,
    },
    sheetTitle: { fontSize: 19, fontWeight: '400', color: '#1f2937' },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },

    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: 10,
        padding: 14,
        marginTop: 8,
    },
    itemLabel: { flex: 1, color: '#4b5563', fontSize: 14 },
    itemValue: { color: '#111827', fontWeight: '300', fontSize: 14 },

    detailIcon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#eef2ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },

    primaryBtn: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1f3a8a',
        borderRadius: 14,
        paddingVertical: 10,
        shadowColor: '#1f3a8a',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
    },
    primaryBtnDisabled: {
        backgroundColor: '#9ca3af',
        shadowOpacity: 0,
    },
    primaryBtnText: { color: '#fff', fontWeight: '400', fontSize: 15 },
    waitingText: {
        marginTop: 8,
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'center',
        fontStyle: 'italic',
    },

    // New logout button styles
    logoutBtn: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ef4444',
        borderRadius: 14,
        paddingVertical: 10,
        shadowColor: '#ef4444',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
    },
    logoutBtnText: { color: '#fff', fontWeight: '400', fontSize: 15 },

    // Loading and clear button styles
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        paddingVertical: 12,
    },
    loadingText: {
        marginLeft: 8,
        color: '#1f3a8a',
        fontWeight: '600',
    },
    clearBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fee2e2',
        borderRadius: 14,
        paddingVertical: 10,
    },
    clearBtnText: { color: '#ef4444', fontWeight: '400', fontSize: 15 },

    // Progress styles for map download
    progressSection: {
        marginTop: 12,
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        padding: 12,
    },
    progressLabel: {
        fontSize: 13,
        color: '#6b7280',
        marginBottom: 8,
        fontWeight: '500',
    },
    progressBar: {
        height: 8,
        backgroundColor: '#e5e7eb',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 4,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#1f3a8a',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'right',
        fontWeight: '600',
    },
});
