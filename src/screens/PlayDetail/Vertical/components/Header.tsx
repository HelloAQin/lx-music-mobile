import { memo, useRef, useCallback } from 'react'

import { View, StyleSheet, Alert } from 'react-native'
import RNFS from 'react-native-fs'
import { pop } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import { useTheme } from '@/store/theme/hook'
import { usePlayerMusicInfo, usePlayMusicInfo } from '@/store/player/hook'
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
import { getLyricInfo, getMusicUrl, getPicUrl } from '@/core/music'
import { QUALITYS } from '@/utils/musicSdk/utils'
import { writeLyric, writePic } from '@/utils/localMediaMetadata'
import { unlink } from '@/utils/fs'

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
  const playMusicInfo = usePlayMusicInfo()

  const back = () => {
    void pop(commonState.componentIds.playDetail!)
  }

  const showSetting = () => {
    popupRef.current?.show()
  }

  const showMusicInfo = () => {
    if (!playMusicInfo?.musicInfo) {
      toast('音乐信息不存在')
      return
    }
    const musicInfo = playMusicInfo.musicInfo as LX.Music.MusicInfoOnline
    
    Alert.alert(
      '音乐信息',
      JSON.stringify(musicInfo, null, 2),
      [{ text: '确定', onPress: () => {} }],
      { cancelable: true }
    )
  }

  const handleDownload = useCallback(async () => {
    if (!playMusicInfo?.musicInfo) {
      toast('音乐信息不存在')
      return
    }

    if (playMusicInfo.musicInfo.source == 'local') {
      toast('本地音乐无需下载')
      return
    }

    const hasPermission = await requestStoragePermission()
    if (!hasPermission) {
      toast('请先授权存储权限')
      return
    }

    const musicInfo = playMusicInfo.musicInfo as LX.Music.MusicInfoOnline
    const availableQualitys = QUALITYS.filter(quality => {
      return musicInfo.meta._qualitys?.[quality]
    })

    if (!availableQualitys.length) {
      toast('没有可用的音质')
      return
    }

    const qualityItems = availableQualitys.map(quality => ({
      text: `${quality} (${musicInfo.meta._qualitys[quality]?.size || '未知大小'})`,
      onPress: () => handleDownloadWithQuality(quality)
    }))

    Alert.alert(
      '选择下载音质',
      '请选择要下载的音质',
      qualityItems,
      { cancelable: true }
    )
  }, [playMusicInfo])

  const handleDownloadWithQuality = useCallback(async(quality: string) => {
    if (!playMusicInfo?.musicInfo) {
      toast('音乐信息不存在')
      return
    }

    try {
      toast('开始下载, 音质 ' + quality)
      const url = await getMusicUrl({
        musicInfo: playMusicInfo.musicInfo,
        quality: quality as LX.Quality,
        isRefresh: true,
        onToggleSource: () => {},
        allowToggleSource: false,
      })
      if (!url) {
        toast('获取下载链接失败')
        return
      }
      const fileName = `${playMusicInfo.musicInfo.name || '未知歌曲'}-${playMusicInfo.musicInfo.singer || '未知歌手'}`
      const mp3Path = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.${quality.includes('flac') ? 'flac' : 'mp3'}`
      await downloadFile(url, mp3Path)

      // 获取并嵌入歌词
      try {
        const lyricInfo = await getLyricInfo({ musicInfo: playMusicInfo.musicInfo })
        if (lyricInfo && lyricInfo.lyric) {
          await writeLyric(mp3Path, lyricInfo.lyric)
          toast('歌词嵌入成功')
        }
      } catch (e) {
        toast('获取或嵌入歌词失败:' + e)
        // 歌词获取失败不影响主流程
      }

      // 获取并嵌入封面
      try {
        const picUrl = await getPicUrl({ 
          musicInfo: playMusicInfo.musicInfo,
          isRefresh: true 
        })
        if (picUrl) {
          const picPath = `${RNFS.ExternalStorageDirectoryPath}/Music/${fileName}.jpg`
          await downloadFile(picUrl, picPath)
          await writePic(mp3Path, picPath)
          // 删除临时下载的封面文件
          await unlink(picPath)
          toast('封面嵌入成功')
        }
      } catch (e) {
        toast('获取或嵌入封面失败:' + e)
        // 封面获取失败不影响主流程
      }

      toast('下载完成: ' + mp3Path)
    } catch (err) {
      console.error('下载失败:', err)
      toast('下载失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [playMusicInfo])

  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}>
      <StatusBar />
      <View style={styles.container}>
        <Btn icon="chevron-left" onPress={back} />
        <Title />
        <TimeoutExitBtn />
        <Btn icon="download-2" onPress={handleDownload} />
        <Btn icon="help" onPress={showMusicInfo} />
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
