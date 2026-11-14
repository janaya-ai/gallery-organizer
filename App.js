import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, FlatList,
  Image, TouchableOpacity, Modal, Alert, Dimensions, SafeAreaView, ActivityIndicator, StatusBar
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';

let db = null;
try {
  db = SQLite.openDatabaseSync('gallery_metadata.db');
} catch (e) {
  console.log('Database init notice:', e.message);
}

const { width } = Dimensions.get('window');
const COLUMN_SIZE = width / 3 - 4;

export default function App() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [titles, setTitles] = useState({});
  const [activeTab, setActiveTab] = useState('gallery');
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (perm.status === 'granted' || perm.accessPrivileges === 'all' || perm.accessPrivileges === 'limited') {
        setPermissionGranted(true);
        await loadPhotos();
      } else {
        setPermissionGranted(false);
      }
    } catch (e) {
      console.log('Permission notice:', e.message);
    }

    try {
      if (db && db.execSync) {
        db.execSync('CREATE TABLE IF NOT EXISTS photo_titles (asset_id TEXT PRIMARY KEY, title TEXT);');
        loadTitles();
      }
    } catch (e) {
      console.log('DB notice:', e.message);
    }
  }

  function loadTitles() {
    try {
      if (!db || !db.getAllSync) return;
      const rows = db.getAllSync('SELECT * FROM photo_titles;');
      const map = {};
      rows.forEach((r) => { map[r.asset_id] = r.title; });
      setTitles(map);
    } catch (e) {
      console.log(e);
    }
  }

  async function loadPhotos() {
    setLoading(true);
    try {
      const media = await MediaLibrary.getAssetsAsync({
        first: 150,
        mediaType: 'photo',
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      setAssets(media.assets || []);
      setPermissionGranted(true);
    } catch (e) {
      Alert.alert('Load Photos Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestAndLoad() {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (perm.status === 'granted' || perm.accessPrivileges === 'all' || perm.accessPrivileges === 'limited') {
        setPermissionGranted(true);
        await loadPhotos();
      } else {
        Alert.alert(
          'Permission Needed',
          'Please allow Photo access in Phone Settings > Apps > Gallery Organizer > Permissions.'
        );
      }
    } catch (e) {
      Alert.alert('Permission Error', e.message);
    }
  }

  function saveTitle() {
    if (!selectedAsset) return;
    const cleanTitle = titleInput.trim();
    try {
      if (db && db.runSync) {
        db.runSync('INSERT OR REPLACE INTO photo_titles (asset_id, title) VALUES (?, ?);', [
          selectedAsset.id,
          cleanTitle,
        ]);
      }
      setTitles((prev) => ({ ...prev, [selectedAsset.id]: cleanTitle }));
    } catch (e) {
      console.log(e);
    }
    setSelectedAsset(null);
    setTitleInput('');
  }

  async function autoSortScreenshots() {
    try {
      const screenshots = assets.filter((a) =>
        (a.filename && a.filename.toLowerCase().includes('screenshot')) ||
        (a.uri && a.uri.toLowerCase().includes('screenshot'))
      );

      if (screenshots.length === 0) {
        Alert.alert('Auto-Sort', 'No screenshots found in your loaded photos.');
        return;
      }

      let album = await MediaLibrary.getAlbumAsync('Screenshots');
      if (!album) {
        album = await MediaLibrary.createAlbumAsync('Screenshots', screenshots[0], false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync(screenshots, album, false);
      }
      Alert.alert('Auto-Sort Completed', `Organized ${screenshots.length} screenshot(s) into your Screenshots album.`);
    } catch (e) {
      Alert.alert('Auto-Sort Error', e.message);
    }
  }

  function groupDuplicates() {
    const groups = {};
    assets.forEach((asset) => {
      const timeBucket = Math.floor(asset.creationTime / 4000);
      const key = `${asset.width}x${asset.height}_${timeBucket}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(asset);
    });

    const dupes = Object.values(groups).filter((group) => group.length > 1);
    setDuplicateGroups(dupes);
    setActiveTab('duplicates');
    if (dupes.length === 0) {
      Alert.alert('Duplicate Finder', 'No burst shots or matching duplicate photos found.');
    }
  }

  const filteredAssets = assets.filter((asset) => {
    if (!searchQuery) return true;
    const title = titles[asset.id] || '';
    return (
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.filename && asset.filename.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e293b" />
      <View style={styles.header}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search by custom title or name..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={autoSortScreenshots}>
            <Text style={styles.actionBtnText}>⚡ Auto-Sort</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.accentBtn]} onPress={groupDuplicates}>
            <Text style={styles.actionBtnText}>🔍 Find Duplicates</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'gallery' && styles.activeTab]}
          onPress={() => setActiveTab('gallery')}
        >
          <Text style={[styles.tabText, activeTab === 'gallery' && styles.activeTabText]}>
            Gallery ({assets.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'duplicates' && styles.activeTab]}
          onPress={() => setActiveTab('duplicates')}
        >
          <Text style={[styles.tabText, activeTab === 'duplicates' && styles.activeTabText]}>
            Duplicates ({duplicateGroups.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.emptyText}>Scanning phone gallery...</Text>
        </View>
      ) : activeTab === 'gallery' ? (
        filteredAssets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {permissionGranted ? 'No photos match your search.' : 'Photo permission needed to show gallery.'}
            </Text>
            <TouchableOpacity style={styles.reloadBtn} onPress={requestAndLoad}>
              <Text style={styles.actionBtnText}>Grant Permission & Load</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredAssets}
            numColumns={3}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.thumbnailContainer}
                onPress={() => {
                  setSelectedAsset(item);
                  setTitleInput(titles[item.id] || '');
                }}
              >
                <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                {titles[item.id] ? (
                  <View style={styles.titleBadge}>
                    <Text style={styles.titleBadgeText} numberOfLines={1}>
                      {titles[item.id]}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )}
          />
        )
      ) : (
        <FlatList
          data={duplicateGroups}
          keyExtractor={(_, index) => `dupe-group-${index}`}
          renderItem={({ item, index }) => (
            <View style={styles.duplicateGroupCard}>
              <Text style={styles.groupHeader}>Group #{index + 1} ({item.length} photos)</Text>
              <View style={styles.groupPhotosRow}>
                {item.map((photo) => (
                  <Image key={photo.id} source={{ uri: photo.uri }} style={styles.groupThumbnail} />
                ))}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Tap 'Find Duplicates' above to scan your gallery.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!selectedAsset} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Custom Title</Text>
            {selectedAsset ? (
              <Image source={{ uri: selectedAsset.uri }} style={styles.previewImage} resizeMode="cover" />
            ) : null}
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Receipt, Sunset, Family trip..."
              placeholderTextColor="#94a3b8"
              value={titleInput}
              onChangeText={setTitleInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedAsset(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveTitle}>
                <Text style={styles.saveBtnText}>Save Title</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 12, backgroundColor: '#1e293b' },
  searchBar: {
    backgroundColor: '#334155',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  accentBtn: { backgroundColor: '#8b5cf6' },
  actionBtnText: { color: '#fff', fontWeight: 'bold' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#334155' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderColor: '#3b82f6' },
  tabText: { color: '#94a3b8', fontWeight: '600' },
  activeTabText: { color: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: '#94a3b8', fontSize: 16, marginBottom: 14, textAlign: 'center' },
  reloadBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  thumbnailContainer: { margin: 2, position: 'relative' },
  thumbnail: { width: COLUMN_SIZE, height: COLUMN_SIZE, borderRadius: 4 },
  titleBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
  titleBadgeText: { color: '#fff', fontSize: 10 },
  duplicateGroupCard: { backgroundColor: '#1e293b', margin: 10, padding: 12, borderRadius: 8 },
  groupHeader: { color: '#fff', fontWeight: 'bold', marginBottom: 8 },
  groupPhotosRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  groupThumbnail: { width: 80, height: 80, borderRadius: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  previewImage: { width: '100%', height: 220, borderRadius: 8, marginBottom: 12 },
  modalInput: { backgroundColor: '#334155', color: '#fff', borderRadius: 8, padding: 12, marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { padding: 10 },
  cancelBtnText: { color: '#94a3b8' },
  saveBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
});
