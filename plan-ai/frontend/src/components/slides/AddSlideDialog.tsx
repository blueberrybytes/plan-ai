import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Box,
  Typography,
} from "@mui/material";
import { SLIDE_TYPES } from "./slideTypes";
import { useGenerateSingleSlideMutation } from "../../store/apis/slideApi";

interface AddSlideDialogProps {
  open: boolean;
  onClose: () => void;
  presentationId: string;
  currentSlideIndex: number;
  totalSlides: number;
  onSlideAdded?: (newSlideIndex: number) => void;
}

const AddSlideDialog: React.FC<AddSlideDialogProps> = ({
  open,
  onClose,
  presentationId,
  currentSlideIndex,
  totalSlides,
  onSlideAdded,
}) => {
  const [generateSingleSlide, { isLoading }] = useGenerateSingleSlideMutation();

  const [prompt, setPrompt] = useState("");
  const [slideTypeKey, setSlideTypeKey] = useState<string>("auto");
  const [positionChoice, setPositionChoice] = useState<"after" | "before" | "end">("after");

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    let targetPosition = currentSlideIndex + 1;
    if (positionChoice === "before") {
      targetPosition = currentSlideIndex;
    } else if (positionChoice === "end") {
      targetPosition = totalSlides;
    }

    try {
      await generateSingleSlide({
        id: presentationId,
        data: {
          prompt,
          position: targetPosition,
          slideTypeKey: slideTypeKey === "auto" ? undefined : slideTypeKey,
        },
      }).unwrap();

      if (onSlideAdded) {
        onSlideAdded(targetPosition);
      }
      onClose();
      // Reset form
      setPrompt("");
      setSlideTypeKey("auto");
      setPositionChoice("after");
    } catch (error) {
      console.error("Failed to add slide", error);
      alert("Failed to generate and add the slide.");
    }
  };

  return (
    <Dialog open={open} onClose={!isLoading ? onClose : undefined} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Slide</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 1 }}>
          <TextField
            select
            label="Insert Position"
            fullWidth
            value={positionChoice}
            onChange={(e) => setPositionChoice(e.target.value as "after" | "before" | "end")}
            disabled={isLoading}
          >
            <MenuItem value="before">
              Before current slide (Position {currentSlideIndex + 1})
            </MenuItem>
            <MenuItem value="after">
              After current slide (Position {currentSlideIndex + 2})
            </MenuItem>
            <MenuItem value="end">At the end</MenuItem>
          </TextField>

          <TextField
            select
            label="Slide Type"
            fullWidth
            value={slideTypeKey}
            onChange={(e) => setSlideTypeKey(e.target.value)}
            disabled={isLoading}
            helperText="Select 'AI Decides' to automatically pick the best type for your prompt."
          >
            <MenuItem value="auto">
              <Typography fontWeight="bold">✨ AI Decides (Recommended)</Typography>
            </MenuItem>
            {SLIDE_TYPES.map((type) => (
              <MenuItem key={type.key} value={type.key}>
                {type.name} -{" "}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {type.description}
                </Typography>
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Slide Content Prompt"
            multiline
            rows={4}
            fullWidth
            placeholder="Describe what this slide should be about. E.g. 'Add a slide showing our Q4 financial goals with 3 bullet points.'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={isLoading} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!prompt.trim() || isLoading}
          startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {isLoading ? "Generating Slide..." : "Add Slide"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddSlideDialog;
