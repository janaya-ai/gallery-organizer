import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, FlatList,
  Image, TouchableOpacity, Modal, Alert, Dimensions,
  SafeAreaView, ActivityIndicator, StatusBar, ScrollView
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [endCursor, setEndCursor] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [titles, setTitles] = useState({});
  const [activeTab, setActiveTab] = useState('gallery'); // 'gallery' | 'duplicates' | 'albums'
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (newest) | 'asc' (oldest)
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [existingAlbums, setExistingAlbums] = useState([]);
  const [albumModalVisible, setAlbumModalVisible] = useState(false);
  const [newAlbumInput, setNewAlbumInput] = useState('');
  const [showNewAlbumModal, setShowNewAlbumModal] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (perm.status === 'granted' || perm.accessPrivileges === 'all' || perm.accessPrivileges === 'limited') {
        setPermissionGranted(true);
        await loadInitialPhotos();
        loadPhoneAlbums();
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
      console.log('Error loading titles:', e);
    }
  }

  async function loadPhoneAlbums() {
    try {
      const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      setExistingAlbums(albums || []);
    } catch (e) {
      console.log('Albums notice:', e.message);
    }
  }

  async function loadInitialPhotos(customSort = sortOrder) {
    setLoading(true);
    try {
      const media = await MediaLibrary.getAssetsAsync({
        first: 90,
        mediaType: 'photo',
        sortBy: [customSort === 'desc' ? MediaLibrary.SortBy.creationTime : [MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets(media.assets || []);
      setEndCursor(media.endCursor || null);
      setHasNextPage(media.hasNextPage || false);
      setTotalCount(media.totalCount || (media.assets ? media.assets.length : 0));
      setPermissionGranted(true);
    } catch (e) {
      Alert.alert('Load Photos Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMorePhotos() {
    if (!hasNextPage || loadingMore || !endCursor) return;
    setLoadingMore(true);
    try {
      const media = await MediaLibrary.getAssetsAsync({
        first: 90,
        after: endCursor,
        mediaType: 'photo',
        sortBy: [sortOrder === 'desc' ? MediaLibrary.SortBy.creationTime : [MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets((prev) => [...prev, ...(media.assets || [])]);
      setEndCursor(media.endCursor || null);
      setHasNextPage(media.hasNextPage || false);
    } catch (e) {
      console.log('Load more error:', e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function requestAndLoad() {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (perm.status === 'granted' || perm.accessPrivileges === 'all' || perm.accessPrivileges === 'limited') {
        setPermissionGranted(true);
        await loadInitialPhotos();
        loadPhoneAlbums();
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
      Alert.alert('Title Saved', cleanTitle ? `Title "${cleanTitle}" saved!` : 'Title cleared.');
    } catch (e) {
      console.log(e);
    }
    setSelectedAsset(null);
    setTitleInput('');
  }

  async function handleAddAssetToAlbum(album) {
    if (!selectedAsset) return;
    try {
      await MediaLibrary.addAssetsToAlbumAsync([selectedAsset], album, false);
      Alert.alert('Album Updated', `Photo added to "${album.title}"!`);
      setAlbumModalVisible(false);
    } catch (err) {
      // Fallback with copy=true if moving is restricted by Scoped Storage
      try {
        await MediaLibrary.addAssetsToAlbumAsync([selectedAsset], album, true);
        Alert.alert('Album Updated', `Photo copied to "${album.title}"!`);
        setAlbumModalVisible(false);
      } catch (e2) {
        Alert.alert('Album Error', e2.message);
      }
    }
  }

  async function createNewAlbumAndAdd() {
    if (!selectedAsset || !newAlbumInput.trim()) return;
    const albumName = newAlbumInput.trim();
    try {
      const newAlbum = await MediaLibrary.createAlbumAsync(albumName, selectedAsset, false);
      Alert.alert('Album Created', `Created album "${albumName}" and added photo!`);
      setShowNewAlbumModal(false);
      setNewAlbumInput('');
      setAlbumModalVisible(false);
      loadPhoneAlbums();
    } catch (e) {
      Alert.alert('Error Creating Album', e.message);
    }
  }

  async function handleSortSelection(type) {
    setSortModalVisible(false);
    if (type === 'newest') {
      setSortOrder('desc');
      await loadInitialPhotos('desc');
    } else if (type === 'oldest') {
      setSortOrder('asc');
      await loadInitialPhotos('asc');
    } else if (type === 'screenshots') {
      await autoSortScreenshots();
    }
  }

  async function autoSortScreenshots() {
    setLoading(true);
    try {
      // Scan up to 1000 items to find screenshots
      const batch = await MediaLibrary.getAssetsAsync({
        first: 1000,
        mediaType: 'photo',
      });
      const allFound = batch.assets || [];
      const screenshots = allFound.filter((a) =>
        (a.filename && a.filename.toLowerCase().includes('screenshot')) ||
        (a.uri && a.uri.toLowerCase().includes('screenshot'))
      );

      if (screenshots.length === 0) {
        Alert.alert('Auto-Sort', 'No screenshots found in your recent photos.');
        return;
      }

      let album = await MediaLibrary.getAlbumAsync('Screenshots');
      if (!album) {
        album = await MediaLibrary.createAlbumAsync('Screenshots', screenshots[0], false);
        if (screenshots.length > 1) {
          await MediaLibrary.addAssetsToAlbumAsync(screenshots.slice(1), album, false);
        }
      } else {
        await MediaLibrary.addAssetsToAlbumAsync(screenshots, album, false);
      }
      Alert.alert('Auto-Sort Complete', `Organized ${screenshots.length} screenshot(s) into your "Screenshots" album.`);
      loadPhoneAlbums();
    } catch (e) {
      Alert.alert('Auto-Sort Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function scanAllDuplicates() {
    setActiveTab('duplicates');
    setScanningDuplicates(true);
    try {
      // Load a large batch of photos sorted by creationTime
      const batch = await MediaLibrary.getAssetsAsync({
        first: 1500,
        mediaType: 'photo',
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      const list = batch.assets || [];
      if (list.length === 0) {
        setDuplicateGroups([]);
        Alert.alert('Duplicate Finder', 'No photos found to scan.');
        return;
      }

      // Linear scan for adjacent duplicate or burst shots
      const groups = [];
      let currentGroup = [list[0]];

      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const curr = list[i];
        const timeDiff = Math.abs((curr.creationTime || 0) - (prev.creationTime || 0));
        const sameDimensions = curr.width && prev.width && curr.width === prev.width && curr.height === prev.height;
        const sameName = curr.filename && prev.filename && curr.filename.replace(/ copy|\(\d+\)/gi, '') === prev.filename.replace(/ copy|\(\d+\)/gi, '');

        // Within 12 seconds and exact same dimensions, or identical names
        if ((sameDimensions && timeDiff <= 12000) || (sameName && sameDimensions)) {
          currentGroup.push(curr);
        } else {
          if (currentGroup.length > 1) {
            groups.push(currentGroup);
          }
          currentGroup = [curr];
        }
      }
      if (currentGroup.length > 1) {
        groups.push(currentGroup);
      }

      setDuplicateGroups(groups);
      if (groups.length === 0) {
        Alert.alert('Duplicate Finder', 'Scanned 1,500 photos and found no burst shots or duplicates.');
      } else {
        const totalDupes = groups.reduce((acc, g) => acc + g.length, 0);
        Alert.alert('Duplicates Found', `Found ${groups.length} groups (${totalDupes} photos total).`);
      }
    } catch (e) {
      Alert.alert('Scan Error', e.message);
    } finally {
      setScanningDuplicates(false);
    }
  }

  async function deleteDuplicatePhoto(photoId, groupIndex) {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo from your gallery?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await MediaLibrary.deleteAssetsAsync([photoId]);
              // Remove from state
              setDuplicateGroups((prev) => {
                const next = [...prev];
                next[groupIndex] = next[groupIndex].filter((p) => p.id !== photoId);
                return next.filter((g) => g.length > 1);
              });
              setAssets((prev) => prev.filter((a) => a.id !== photoId));
            } catch (e) {
              Alert.alert('Delete Error', e.message);
            }
          },
        },
      ]
    );
  }

  const filteredAssets = assets.filter((asset) => {
    if (!searchQuery) return true;
    const title = titles[asset.id] || '';
    const q = searchQuery.toLowerCase();
    return title.toLowerCase().includes(q) || (asset.filename && asset.filename.toLowerCase().includes(q));
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e293b" />
      
      {/* Header with Search and Action Buttons */}
      <View style={styles.header}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search by custom title or filename..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setSortModalVisible(true)}>
            <Text style={styles.actionBtnText}>⚡ Auto-Sort</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.accentBtn]} onPress={scanAllDuplicates}>
            <Text style={styles.actionBtnText}>🔍 Find Duplicates</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'gallery' && styles.activeTab]}
          onPress={() => setActiveTab('gallery')}
        >
          <Text style={[styles.tabText, activeTab === 'gallery' && styles.activeTabText]}>
            Gallery {totalCount > 0 ? `(${totalCount})` : assets.length > 0 ? `(${assets.length})` : ''}
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
        <TouchableOpacity
          style={[styles.tab, activeTab === 'albums' && styles.activeTab]}
          onPress={() => {
            loadPhoneAlbums();
            setActiveTab('albums');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'albums' && styles.activeTabText]}>
            Albums ({existingAlbums.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.emptyText}>Loading your gallery photos...</Text>
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
            onEndReached={loadMorePhotos}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Loading more photos...</Text>
                </View>
              ) : null
            }
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
      ) : activeTab === 'duplicates' ? (
        scanningDuplicates ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.emptyText}>Scanning your gallery for duplicates & burst shots...</Text>
          </View>
        ) : (
          <FlatList
            data={duplicateGroups}
            keyExtractor={(_, index) => `dupe-group-${index}`}
            renderItem={({ item, index }) => (
              <View style={styles.duplicateGroupCard}>
                <View style={styles.duplicateHeaderRow}>
                  <Text style={styles.groupHeader}>Group #{index + 1} ({item.length} photos)</Text>
                  <Text style={styles.groupSub}>{item[0].width}x{item[0].height}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupPhotosScroll}>
                  {item.map((photo) => (
                    <View key={photo.id} style={styles.duplicatePhotoWrapper}>
                      <Image source={{ uri: photo.uri }} style={styles.groupThumbnail} />
                      <TouchableOpacity
                        style={styles.deletePhotoBadge}
                        onPress={() => deleteDuplicatePhoto(photo.id, index)}
                      >
                        <Text style={styles.deletePhotoText}>✕ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No duplicate groups yet.</Text>
                <TouchableOpacity style={[styles.reloadBtn, styles.accentBtn]} onPress={scanAllDuplicates}>
                  <Text style={styles.actionBtnText}>Scan Gallery for Duplicates</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )
      ) : (
        /* Albums Tab */
        <FlatList
          data={existingAlbums}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.albumRow}>
              <View style={styles.albumIconBox}>
                <Text style={styles.albumIcon}>📁</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.albumTitle}>{item.title}</Text>
                <Text style={styles.albumSub}>{item.assetCount} photos</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No albums found on your device.</Text>
            </View>
          }
        />
      )}

      {/* Photo Detail Modal: Title & Add to Album */}
      <Modal visible={!!selectedAsset} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Photo Details</Text>
            {selectedAsset ? (
              <Image source={{ uri: selectedAsset.uri }} style={styles.previewImage} resizeMode="cover" />
            ) : null}

            {/* Custom Title Section */}
            <Text style={styles.sectionLabel}>Custom Title</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Receipt, Sunset, Family trip..."
              placeholderTextColor="#94a3b8"
              value={titleInput}
              onChangeText={setTitleInput}
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.albumSelectBtn} onPress={() => setAlbumModalVisible(true)}>
                <Text style={styles.albumSelectBtnText}>📁 Add to Album</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveTitle}>
                <Text style={styles.saveBtnText}>Save Title</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setSelectedAsset(null)}>
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add To Album Picker Modal */}
      <Modal visible={albumModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Select Album</Text>
            <TouchableOpacity style={styles.createAlbumBtn} onPress={() => setShowNewAlbumModal(true)}>
              <Text style={styles.createAlbumBtnText}>+ Create New Album</Text>
            </TouchableOpacity>
            <FlatList
              data={existingAlbums}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300, marginVertical: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.albumPickerItem} onPress={() => handleAddAssetToAlbum(item)}>
                  <Text style={styles.albumPickerText}>📁 {item.title}</Text>
                  <Text style={styles.albumPickerSub}>{item.assetCount} photos</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAlbumModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create New Album Modal */}
      <Modal visible={showNewAlbumModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Album Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Album name..."
              placeholderTextColor="#94a3b8"
              value={newAlbumInput}
              onChangeText={setNewAlbumInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowNewAlbumModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={createNewAlbumAndAdd}>
                <Text style={styles.saveBtnText}>Create & Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Auto-Sort Options Modal */}
      <Modal visible={sortModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚡ Auto-Sort Options</Text>
            <TouchableOpacity style={styles.sortOptionBtn} onPress={() => handleSortSelection('newest')}>
              <Text style={styles.sortOptionText}>📅 Sort Newest First</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortOptionBtn} onPress={() => handleSortSelection('oldest')}>
              <Text style={styles.sortOptionText}>⏳ Sort Oldest First</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortOptionBtn} onPress={() => handleSortSelection('screenshots')}>
              <Text style={styles.sortOptionText}>📱 Move Screenshots to Album</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSortModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
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
  duplicateHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  groupHeader: { color: '#fff', fontWeight: 'bold' },
  groupSub: { color: '#94a3b8', fontSize: 12 },
  groupPhotosScroll: { flexDirection: 'row' },
  duplicatePhotoWrapper: { marginRight: 10, alignItems: 'center' },
  groupThumbnail: { width: 90, height: 90, borderRadius: 6 },
  deletePhotoBadge: { backgroundColor: '#ef4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginTop: 4 },
  deletePhotoText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  albumRow: { flexDirection: 'row', padding: 14, borderBottomWidth: 1, borderColor: '#1e293b', alignItems: 'center' },
  albumIconBox: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  albumIcon: { fontSize: 22 },
  albumTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  albumSub: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  sectionLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  previewImage: { width: '100%', height: 200, borderRadius: 8, marginBottom: 12 },
  modalInput: { backgroundColor: '#334155', color: '#fff', borderRadius: 8, padding: 12, marginBottom: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  albumSelectBtn: { flex: 1, backgroundColor: '#334155', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  albumSelectBtnText: { color: '#38bdf8', fontWeight: 'bold' },
  saveBtn: { flex: 1, backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  closeModalBtn: { paddingVertical: 8, alignItems: 'center' },
  closeModalBtnText: { color: '#94a3b8', fontSize: 14 },
  createAlbumBtn: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  createAlbumBtnText: { color: '#fff', fontWeight: 'bold' },
  albumPickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#334155' },
  albumPickerText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  albumPickerSub: { color: '#94a3b8', fontSize: 12 },
  cancelBtn: { padding: 12, alignItems: 'center' },
  cancelBtnText: { color: '#94a3b8' },
  sortOptionBtn: { backgroundColor: '#334155', padding: 14, borderRadius: 8, marginBottom: 10 },
  sortOptionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
