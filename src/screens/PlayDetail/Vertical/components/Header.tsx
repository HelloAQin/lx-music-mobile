import { memo, useRef, useCallback } from 'react'

import { View, StyleSheet } from 'react-native'
import { PermissionsAndroid, Platform } from 'react-native'
import RNFS from 'react-native-fs'
import { pop } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import { useTheme } from '@/store/theme/hook'
import { usePlayerMusicInfo } from '@/store/player/hook'
import Text from '@/components/common/Text'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import commonState from '@/store/common/state'
import SettingPopup, { type SettingPopupType } from '../../components/SettingPopup'
import { useStatusbarHeight } from '@/store/common/hook'
import Btn from './Btn'
import TimeoutExitBtn from './TimeoutExitBtn'
import { downloadFile } from '@/utils/fs'
import { toast, requestStoragePermission } from '@/utils/tools'
import { getLyricInfo } from '@/core/music'
import { getMusicUrl } from '@/core/music'
import { Alert } from 'react-native'

export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)


const Title = () => {
  const theme = useTheme()
  const musicInfo = usePlayerMusicInfo()


  return (
    <View style={styles.titleContent}>
      <Text numberOfLines={1} style={styles.title}>{musicInfo.name}</Text>
      <Text numberOfLines={1} style={styles.title} size={12} color={theme['c-font-label']}>{musicInfo.singer}</Text>
    </View>
  )
}

export default memo(() => {
  const popupRef = useRef<SettingPopupType>(null)
  const statusBarHeight = useStatusbarHeight()
  const musicInfo = usePlayerMusicInfo()

  const back = () => {
    void pop(commonState.componentIds.playDetail!)
  }
  const showSetting = () => {
    popupRef.current?.show()
  }
    
  const handleDownload = useCallback(async () => {
    if (!musicInfo) {
      toast('音乐信息不存在')
      return
    }

    const hasPermission = await requestStoragePermission()
    if (!hasPermission) {
      toast('请先授权存储权限')
      return
    }
    
    try {
      console.log('开始下载，音乐信息:', musicInfo)
      if (!musicInfo.meta) {
        musicInfo.meta = {
          albumName: '',
          picUrl: '',
          _qualitys: {},
        }
      }

      // 获取可用音质列表
      const qualities = Object.keys(musicInfo.meta._qualitys || {})
      if (qualities.length === 0) {
        const url = await getMusicUrl({ musicInfo, isRefresh: true })
        if (!url) {
          toast('获取下载链接失败')
          return
        }
        await startDownload(url)
      } else {
        // 显示音质选择对话框，包含文件大小信息
        Alert.alert(
          '选择下载音质',
          '请选择要下载的音质',
          qualities.map(quality => {
            const qualityInfo = musicInfo.meta._qualitys[quality]
            const size = formatFileSize(qualityInfo.size)
            return {
              text: `${getQualityText(quality)} (${size})`,
              onPress: async () => {
                const url = await getMusicUrl({ musicInfo, isRefresh: true, quality })
                if (!url) {
                  toast('获取下载链接失败')
                  return
                }
                await startDownload(url)
              },
            }
          }),
          { cancelable: true }
        )
      }
    } catch (err) {
      console.error('下载失败:', err)
      toast('下载失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [musicInfo])

  // 辅助函数：格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '未知大小'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(2)}${units[unitIndex]}`
  }

  // 辅助函数：获取音质显示文本
  const getQualityText = (quality: string) => {
    const qualityMap: Record<string, string> = {
      'flac': '无损音质',
      '320k': '超高品质',
      '192k': '高品质',
      '128k': '标准品质',
    }
    return qualityMap[quality] || quality
  }

  // 实际下载处理函数
  const startDownload = async (url: string) => {
    const fileName = `${musicInfo.name || '未知歌曲'}-${musicInfo.singer || '未知歌手'}`
    const mp3Path = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.mp3`
    await downloadFile(url, mp3Path)
    toast('保存地址: ' + mp3Path)

    // 下载歌词
    try {
      const lyricInfo = await getLyricInfo({ musicInfo })
      if (lyricInfo && lyricInfo.lyric) {
        const lrcPath = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.lrc`
        try {
          await RNFS.writeFile(lrcPath, lyricInfo.lyric, 'utf8')
          console.log('歌词保存成功:', lrcPath)
        } catch (e) {
          console.error('歌词保存失败:', e)
        }
      }
    } catch (e) {
      console.error('获取歌词失败:', e)
    }
    toast('下载完成')
  }

  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}>
      <StatusBar />
      <View style={styles.container}>
        <Btn icon="chevron-left" onPress={back} />
        <Title />
        <TimeoutExitBtn />
        <Btn icon="download-2" onPress={handleDownload} />
        <Btn icon="slider" onPress={showSetting} />
      </View>
      <SettingPopup ref={popupRef} direction="vertical" />
    </View>
  )
})


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // justifyContent: 'center',
    height: '100%',
  },
  titleContent: {
    flex: 1,
    paddingHorizontal: 5,
    // alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // flex: 1,
    // textAlign: 'center',
  },
  icon: {
    paddingLeft: 4,
    paddingRight: 4,
  },
})
