import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
} from "@mui/material";
import { uploadSlideImage } from "../../firebase/firebaseStorage";

interface EditSlideTextDialogProps {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slideData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (updatedData: any) => void;
  slideIndex: number;
  presentationId: string;
}

// Simple heuristic to ignore fields that aren't meant for textual presentation, except main image fields
const isImageKey = (key: string) =>
  /icon|logo|avatar|bg|type/i.test(key) && !key.includes("imageQuery") && !key.includes("imageUrl");

const EditSlideTextDialog: React.FC<EditSlideTextDialogProps> = ({
  open,
  onClose,
  slideData,
  onSave,
  slideIndex,
  presentationId,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [formData, setFormData] = useState<any>({});
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (open && slideData) {
      setFormData(JSON.parse(JSON.stringify(slideData)));
    }
  }, [open, slideData]);

  const handleChange = (path: (string | number)[], value: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFormData((prev: any) => {
      const next = { ...prev };
      let current = next;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return next;
    });
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    path: (string | number)[],
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadSlideImage(file, presentationId);
      handleChange(path, url);
    } catch (error) {
      console.error(error);
      alert("Failed to upload image. Please try again or ensure it is under 5MB.");
    } finally {
      setIsUploading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderField = (key: string, value: any, path: (string | number)[], labelPrefix = "") => {
    if (isImageKey(key)) return null;

    const label = labelPrefix ? `${labelPrefix} ${key}` : key;
    const isMultiline =
      typeof value === "string" &&
      (value.length > 50 ||
        key.toLowerCase().includes("body") ||
        key.toLowerCase().includes("description") ||
        key.toLowerCase().includes("mermaid"));

    if (typeof value === "string") {
      if (key === "imageUrl") {
        return (
          <Box key={path.join("-")} sx={{ mb: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              {labelPrefix ? `${labelPrefix} Image URL` : "Slide Image"}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
              <TextField
                fullWidth
                size="small"
                value={value}
                onChange={(e) => handleChange(path, e.target.value)}
                placeholder="https://"
                sx={{ flex: 1 }}
              />
              <Button
                variant="contained"
                component="label"
                disabled={isUploading}
                sx={{ whiteSpace: "nowrap", height: 40 }}
              >
                {isUploading ? "..." : "Upload"}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, path)}
                />
              </Button>
            </Box>
          </Box>
        );
      }

      return (
        <TextField
          key={path.join("-")}
          fullWidth
          margin="dense"
          label={label.charAt(0).toUpperCase() + label.slice(1)}
          value={value}
          onChange={(e) => handleChange(path, e.target.value)}
          multiline={isMultiline}
          rows={isMultiline ? 4 : 1}
          variant="outlined"
          sx={{ mb: 2 }}
        />
      );
    }

    if (Array.isArray(value)) {
      return (
        <Box
          key={path.join("-")}
          sx={{
            mt: 1,
            mb: 3,
            p: 2,
            border: "1px dashed rgba(255,255,255,0.2)",
            borderRadius: 2,
            bgcolor: "rgba(255,255,255,0.02)",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ mb: 2, textTransform: "uppercase", color: "text.secondary" }}
          >
            {key}
          </Typography>
          {value.map((item, index) => {
            if (typeof item === "string") {
              return renderField(index.toString(), item, [...path, index], `Item ${index + 1}`);
            }
            if (typeof item === "object" && item !== null) {
              return (
                <Box
                  key={index}
                  sx={{
                    ml: 1,
                    mb: 2,
                    pl: 2,
                    borderLeft: "2px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1 }}
                  >
                    {key} Item #{index + 1}
                  </Typography>
                  {Object.entries(item).map(([subKey, subVal]) =>
                    renderField(subKey, subVal, [...path, index, subKey]),
                  )}
                </Box>
              );
            }
            return null;
          })}
        </Box>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Edit Slide Texts (Slide {slideIndex + 1})</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Update the text contents of the slide below.
        </Typography>
        <Box sx={{ mt: 1 }}>
          {formData.parameters &&
            Object.entries(formData.parameters).map(([key, value]) =>
              renderField(key, value, ["parameters", key]),
            )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: "text.secondary" }}>
          Cancel
        </Button>
        <Button onClick={() => onSave(formData)} variant="contained" color="primary">
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditSlideTextDialog;
